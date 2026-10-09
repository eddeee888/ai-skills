#!/usr/bin/env python3
"""Contract tests for the read-only COPS workspace memory hook."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "cops/hooks/memory-context.py"


def repository(parent: Path, name: str, remote: str) -> Path:
    path = parent / name
    path.mkdir()
    subprocess.run(["git", "-C", path, "init", "-q"], check=True)
    subprocess.run(["git", "-C", path, "remote", "add", "origin", remote], check=True)
    return path.resolve()


def run_hook(mode: str, repo: str = "", payload: dict[str, object] | None = None) -> str:
    env = dict(os.environ)
    env.pop("PR_MEMORY_REPO", None)
    env.pop("CLAUDE_PLUGIN_OPTION_MEMORY_REPO", None)
    result = subprocess.run(
        ["python3", str(HOOK), mode, repo],
        input=json.dumps(payload or {}),
        capture_output=True,
        text=True,
        check=True,
        env=env,
    )
    return result.stdout.strip()


class MemoryContextTest(unittest.TestCase):
    def test_cursor_resolves_owner_repo_against_https_origin(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = repository(Path(directory), "memory", "https://github.com/acme/memory.git")
            output = json.loads(
                run_hook("cursor", "acme/memory", {"workspace_roots": [str(root)]})
            )
            self.assertIn(f"COPS memory root: {root}", output["additional_context"])
            self.assertIn("Pass this exact path", output["additional_context"])

    def test_cursor_matches_ssh_origin_and_ignores_product_repo(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            product = repository(parent, "product", "git@github.com:acme/product.git")
            memory = repository(parent, "memory", "git@github.com:acme/memory.git")
            output = json.loads(
                run_hook(
                    "cursor",
                    "https://github.com/acme/memory",
                    {"workspace_roots": [str(product), str(memory)]},
                )
            )
            self.assertIn(f"COPS memory root: {memory}", output["additional_context"])

    def test_cursor_rejects_missing_and_ambiguous_matches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            first = repository(parent, "first", "https://github.com/acme/memory.git")
            second = repository(parent, "second", "git@github.com:acme/memory.git")
            missing = json.loads(
                run_hook("cursor", "acme/other", {"workspace_roots": [str(first)]})
            )
            ambiguous = json.loads(
                run_hook(
                    "cursor",
                    "acme/memory",
                    {"workspace_roots": [str(first), str(second)]},
                )
            )
            self.assertIn("no attached workspace repository matches", missing["additional_context"])
            self.assertIn("2 attached workspace repositories match", ambiguous["additional_context"])

    def test_unconfigured_cursor_hook_is_silent(self) -> None:
        self.assertEqual("{}", run_hook("cursor"))

    def test_claude_without_root_emits_remote_identity(self) -> None:
        output = run_hook("claude", "acme/memory")
        self.assertIn("COPS memory repository: acme/memory", output)
        self.assertIn("locate its attached workspace checkout", output)


if __name__ == "__main__":
    unittest.main()
