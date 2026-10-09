#!/usr/bin/env python3
"""Identify an attached COPS memory repository without modifying Git state."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit


def canonical_remote(value: str) -> str:
    value = value.strip().rstrip("/")
    if value.endswith(".git"):
        value = value[:-4]
    if re.fullmatch(r"[^/:]+/[^/]+", value):
        return f"github.com/{value}".lower()
    scp = re.fullmatch(r"(?:[^@]+@)?([^:]+):(.+)", value)
    if scp and "://" not in value:
        return f"{scp.group(1)}/{scp.group(2).lstrip('/')}".lower()
    parsed = urlsplit(value)
    if parsed.scheme and parsed.hostname:
        return f"{parsed.hostname}/{parsed.path.lstrip('/')}".lower()
    if parsed.scheme == "file":
        return f"file:{Path(parsed.path).resolve()}"
    return value.lower()


def repository_root(path: str) -> str | None:
    result = subprocess.run(
        ["git", "-C", path, "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    return str(Path(result.stdout.strip()).resolve()) if result.returncode == 0 else None


def origin_matches(path: str, expected: str) -> bool:
    result = subprocess.run(
        ["git", "-C", path, "remote", "get-url", "--all", "origin"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    return result.returncode == 0 and any(
        canonical_remote(line) == expected for line in result.stdout.splitlines()
    )


def load_input() -> dict[str, object]:
    try:
        value = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return {}
    return value if isinstance(value, dict) else {}


def message(repo: str, roots: list[str]) -> str:
    expected = canonical_remote(repo)
    candidates = {
        root
        for item in roots
        if isinstance(item, str)
        if (root := repository_root(item))
        if origin_matches(root, expected)
    }
    if len(candidates) == 1:
        root = next(iter(candidates))
        return (
            f"COPS memory root: {root}\n"
            "Pass this exact path as `memory-root` to every pr-oracle and "
            "pr-sidekick call. COPS must not clone, pull, commit, or push it."
        )
    if not candidates:
        return (
            f"COPS memory unavailable: no attached workspace repository matches {repo}. "
            "Pass `memory-root: unavailable` to pr-oracle and pr-sidekick."
        )
    return (
        f"COPS memory unavailable: {len(candidates)} attached workspace repositories "
        f"match {repo}. Pass `memory-root: unavailable` to pr-oracle and pr-sidekick."
    )


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "claude"
    argument = sys.argv[2] if len(sys.argv) > 2 else ""
    if argument.startswith("${") and argument.endswith("}"):
        argument = ""
    repo = (
        os.environ.get("PR_MEMORY_REPO")
        or argument
        or os.environ.get("CLAUDE_PLUGIN_OPTION_MEMORY_REPO")
        or ""
    ).strip()
    payload = load_input()
    roots = payload.get("workspace_roots", [])
    roots = list(roots) if isinstance(roots, list) else []
    cwd = payload.get("cwd")
    if isinstance(cwd, str):
        roots.append(cwd)

    if not repo:
        output = ""
    elif roots:
        output = message(repo, roots)
    else:
        output = (
            f"COPS memory repository: {repo}. Before the first pr-oracle or "
            "pr-sidekick call, locate its attached workspace checkout by matching "
            "the origin remote, then pass its root as `memory-root`; if absent or "
            "ambiguous, pass `memory-root: unavailable`."
        )

    if mode == "cursor":
        print(json.dumps({"additional_context": output}) if output else "{}")
    elif output:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
