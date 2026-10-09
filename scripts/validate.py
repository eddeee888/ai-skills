#!/usr/bin/env python3
"""Validate the repository's dependency-free instruction contracts."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

CONVENTION_BUDGETS = {
    "CONVENTIONS.md": 500,
    "CONVENTIONS-orchestration.md": 1200,
    "CONVENTIONS-github.md": 600,
    "CONVENTIONS-posts.md": 1000,
    "CONVENTIONS-pr-metadata.md": 700,
}

POINTER_RE = re.compile(
    r"`(?P<file>CONVENTIONS[^`]*\.md)`\s*→\s*[\"“](?P<section>[^\"”]+)[\"”]"
)
LINK_RE = re.compile(r"!?\[[^\]]*\]\((?P<target>[^)\n]+)\)")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$", re.MULTILINE)


def fail(path: Path | str, message: str) -> None:
    try:
        shown = Path(path).relative_to(ROOT)
    except (TypeError, ValueError):
        shown = path
    ERRORS.append(f"{shown}: {message}")


def repository_files(pattern: str) -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob(pattern)
        if ".git" not in path.parts and path.is_file()
    )


def words(text: str) -> int:
    return len(text.split())


def headings(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return {normalise_heading(match) for match in HEADING_RE.findall(text)}


def normalise_heading(value: str) -> str:
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[`*_~]", "", value)
    return " ".join(value.split()).casefold()


def github_anchor(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[`*_~]", "", value).strip().lower()
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    return re.sub(r"\s+", "-", value)


def markdown_anchors(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return {github_anchor(heading) for heading in HEADING_RE.findall(text)}


def validate_json() -> None:
    for path in repository_files("*.json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            fail(path, f"invalid JSON: {error}")


def validate_shell() -> None:
    for path in repository_files("*.sh"):
        result = subprocess.run(
            ["bash", "-n", str(path)], capture_output=True, text=True, check=False
        )
        if result.returncode:
            detail = (result.stderr or result.stdout).strip()
            fail(path, f"bash -n failed: {detail}")


def validate_convention_copies() -> None:
    for root_copy in sorted(ROOT.glob("CONVENTIONS*.md")):
        expected = root_copy.read_bytes()
        for plugin in ("cops", "oss"):
            plugin_copy = ROOT / plugin / root_copy.name
            if not plugin_copy.exists():
                fail(plugin_copy, f"missing copy of {root_copy.name}")
            elif plugin_copy.read_bytes() != expected:
                fail(
                    plugin_copy,
                    f"must be byte-identical to root {root_copy.name}",
                )


def clean_link_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<") and ">" in target:
        return target[1 : target.index(">")]
    # Markdown permits an optional quoted title after a whitespace-delimited URL.
    return re.split(r"\s+[\"']", target, maxsplit=1)[0]


def validate_markdown_links() -> None:
    anchor_cache: dict[Path, set[str]] = {}
    for source in repository_files("*.md"):
        text = source.read_text(encoding="utf-8")
        for match in LINK_RE.finditer(text):
            raw_target = clean_link_target(match.group("target"))
            if raw_target in {"…", "..."}:
                continue
            parsed = urlsplit(raw_target)
            if parsed.scheme or parsed.netloc:
                continue

            path_part = unquote(parsed.path)
            target = (
                ROOT / path_part.lstrip("/")
                if path_part.startswith("/")
                else source.parent / path_part
            )
            target = target.resolve()
            if not path_part:
                target = source

            try:
                target.relative_to(ROOT)
            except ValueError:
                fail(source, f"internal link escapes repository: {raw_target}")
                continue

            if not target.exists():
                fail(source, f"internal link does not resolve: {raw_target}")
                continue

            if parsed.fragment and target.suffix.lower() == ".md":
                anchor = unquote(parsed.fragment).casefold()
                if target not in anchor_cache:
                    anchor_cache[target] = markdown_anchors(target)
                if anchor not in anchor_cache[target]:
                    fail(
                        source,
                        f"link anchor '#{parsed.fragment}' not found in "
                        f"{target.relative_to(ROOT)}",
                    )


def plugin_root(path: Path) -> Path:
    relative = path.relative_to(ROOT)
    return ROOT / relative.parts[0] if relative.parts[0] in {"cops", "oss"} else ROOT


def validate_convention_pointers() -> None:
    heading_cache: dict[Path, set[str]] = {}
    for source in repository_files("*.md"):
        text = source.read_text(encoding="utf-8")
        for match in POINTER_RE.finditer(text):
            target = plugin_root(source) / match.group("file")
            section = match.group("section")
            if not target.exists():
                fail(
                    source,
                    f"convention pointer targets missing {target.relative_to(ROOT)}",
                )
                continue
            if target not in heading_cache:
                heading_cache[target] = headings(target)
            wanted = normalise_heading(section)
            if not any(
                heading == wanted
                or heading.startswith(f"{wanted}:")
                or heading.startswith(f"{wanted} ")
                for heading in heading_cache[target]
            ):
                fail(
                    source,
                    f'convention pointer section "{section}" not found in '
                    f"{target.relative_to(ROOT)}",
                )


def frontmatter_description(path: Path) -> str | None:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        fail(path, "missing YAML frontmatter")
        return None
    try:
        end = lines.index("---", 1)
    except ValueError:
        fail(path, "YAML frontmatter is not closed with ---")
        return None

    description_lines = [
        line for line in lines[1:end] if re.match(r"^description\s*:", line)
    ]
    if len(description_lines) != 1:
        fail(path, "frontmatter must contain exactly one description")
        return None
    value = description_lines[0].split(":", 1)[1].strip()
    if not value or value in {"|", ">", "|-", ">-"}:
        fail(path, "frontmatter description must be present and single-line")
        return None
    if value[0] in {"'", '"'} and (len(value) < 2 or value[-1] != value[0]):
        fail(path, "frontmatter description quote must close on the same line")
        return None
    return value[1:-1] if value[0] in {"'", '"'} else value


def validate_descriptions() -> None:
    targets = repository_files("SKILL.md")
    targets += [
        path for path in repository_files("*.md") if path.parent.name == "agents"
    ]
    for path in targets:
        description = frontmatter_description(path)
        if description is not None and words(description) > 60:
            fail(
                path,
                f"frontmatter description is {words(description)} words; limit is 60",
            )


def check_budget(path: Path, limit: int, label: str) -> None:
    count = words(path.read_text(encoding="utf-8"))
    if count > limit:
        fail(path, f"{label} is {count} words; limit is {limit}")


def validate_budgets() -> None:
    for filename, limit in CONVENTION_BUDGETS.items():
        check_budget(ROOT / filename, limit, "convention file")

    for path in repository_files("SKILL.md"):
        check_budget(path, 1400, "SKILL.md")

    for path in sorted((ROOT / "cops" / "agents").glob("*.md")):
        check_budget(path, 1000, "agent instruction")

    lazy_paths: set[Path] = set()
    for plugin in ("cops", "oss"):
        skills_root = ROOT / plugin / "skills"
        lazy_paths.update(path for path in skills_root.rglob("*.md") if path.name != "SKILL.md")
        references = ROOT / plugin / "references"
        if references.exists():
            lazy_paths.update(references.rglob("*.md"))
    for path in sorted(lazy_paths):
        check_budget(path, 1200, "lazy instruction")


def require_markers(path: str, groups: dict[str, tuple[str, ...]]) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    for contract, markers in groups.items():
        missing = [marker for marker in markers if marker not in text]
        if missing:
            fail(
                target,
                f"{contract} contract marker(s) missing: "
                + ", ".join(repr(marker) for marker in missing),
            )


def validate_behavioral_contracts() -> None:
    require_markers(
        "cops/agents/pr-oracle.md",
        {
            "five modes": (
                "`scout-repo`",
                "`triage-threads`",
                "`brief-task`",
                "`sweep-diff`",
                "`grill-description`",
            ),
            "no-mode response": ("return exactly `no mode given`",),
        },
    )
    require_markers(
        "cops/skills/pr-address/SKILL.md",
        {
            "PR ownership": ("Compare `author.login` with the authenticated login",),
            "user decision gate": ("Apply no automatic action",),
            "never resolve": ("Never resolve a review thread.",),
        },
    )
    require_markers(
        "cops/skills/pr-review/SKILL.md",
        {
            "confirmation gate": ("Never post without confirmation.",),
            "COMMENT default": ("the event is always `COMMENT`",),
            "head anchoring": ("Keep `headRefOid`",),
        },
    )
    require_markers(
        "cops/skills/pr-review/post-review.md",
        {"headRefOid posting": ("saved `headRefOid`", "`COMMENT` by default")},
    )
    require_markers(
        "oss/skills/issue-verify/SKILL.md",
        {
            "reproduction gate": ("This is a hard gate",),
            "checkpoint": ("Skill: oss:issue-verify",),
            "no PR sync": ("never runs `cops:pr-sync`",),
        },
    )
    require_markers(
        "oss/skills/issue-fix/SKILL.md",
        {
            "option gate": ("This is a hard gate", "User hasn't picked an option"),
            "checkpoint": ("issue-verify` checkpoint",),
            "unnumbered checkpoint discovery": ("no-issue-number path",),
            "no PR sync": ("never runs `cops:pr-sync`",),
            "no duplicate PR": ("Never run `gh pr create`",),
        },
    )
    require_markers(
        "oss/skills/checkpoint.md",
        {
            "exact issue guard": (
                "exact issue number",
                "#<issue-number>([^0-9]|$)",
            ),
            "checkpoint sentinels": (
                "`CHECKPOINT_FOUND`",
                "`CHECKPOINT_NOT_FOUND`",
                "`CHECKPOINT_AMBIGUOUS`",
            ),
        },
    )


def main() -> int:
    checks = (
        validate_json,
        validate_shell,
        validate_convention_copies,
        validate_markdown_links,
        validate_convention_pointers,
        validate_descriptions,
        validate_budgets,
        validate_behavioral_contracts,
    )
    for check in checks:
        check()

    if ERRORS:
        print(f"Validation failed with {len(ERRORS)} error(s):", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        "Validation passed: JSON, shell syntax, convention copies, Markdown "
        "links/pointers, frontmatter descriptions, word budgets, and behavioral "
        "contract markers."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
