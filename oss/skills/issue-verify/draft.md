# Failing-test checkpoint

Read this file only after `SKILL.md` has established that the issue contains a usable reproduction. No code or test work may begin earlier.

## Delegate the failing test

First ask the oracle for `brief-task`, passing the package, the test location, a one-line summary of the repro, and `for: pr-sidekick` (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Apply any `caller only:` lines yourself. If unavailable, use `none` for rules.

Use the `scout-repo` package map, test location, and one-test command when available. Delegate per `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent":

```text
Repo <owner>/<repo> (checked out). Package: <package the repro exercises>.
Tests live: <from the profile>; run one with: <command, or "find out">.
Repro (from issue #<number>): <the repro, verbatim — code, steps or link>
Expected: <expected behavior>. Actual: <what the issue reports>.
Rules that apply: <the brief's lines, or "none">

Write a test that mirrors the repro as closely as possible, asserting the
expected/correct behavior, not the buggy one. Run just that test with a quiet
or summary reporter. Confirm it fails for the reason the issue describes, not
because of a typo or wrong setup in the test itself; fix the test's own
mistakes at most 3 times, then stop and report what's still wrong. Don't
skip it, don't commit, don't push.
Return at most 5 lines: test path, the failure in one or two lines, and
whether it matches the issue (yes/no, why) — or, after 3 tries, why the
test still doesn't run cleanly.
```

No matching failure → discard the test and return to the reporter. Matching failure → preserve the test exactly as a red checkpoint.

## Branch and commit

Leave the test failing; never skip it or mark it pending. Create `repro/<issue-number>` (`CONVENTIONS-pr-metadata.md` → "Checkpoint/fix branch naming"). Commit only the reproduction with this message; `Skill: oss:issue-verify` must be in the final paragraph so discovery can use the anchored trailer. Do not add `Approved-by:` because the user did not approve this commit (`CONVENTIONS-pr-metadata.md` → "Commit trailers"):

```text
test: reproduce #123 — <short bug description>

Skill: oss:issue-verify
```

## Push and draft PR

Push the branch, then open a **draft** PR. Use a non-closing reference, never `Fixes` or `Closes` (`CONVENTIONS-pr-metadata.md` → "Non-closing issue references").

Title: `test: reproduce <short bug description> (failing) (#123)`, with the issue reference last (`CONVENTIONS-pr-metadata.md` → "Trailing issue reference"). In a monorepo prefix the package exercised by the reproduction: `[package-name] test: reproduce <short bug description> (failing) (#123)` (`CONVENTIONS-pr-metadata.md` → "Monorepo title prefix").

Body:

- state this checkpoint proves the bug exists;
- quote the test name and one or two assertion-output lines captured locally;
- explain that `issue-fix` builds directly on this commit and the PR need not merge or go green first;
- link every cited source (`CONVENTIONS-posts.md` → "Citing sources").

Write title and body to files, then run (`CONVENTIONS-github.md` → "Passing drafted text to `gh`"):

```bash
gh pr create --draft --title "$(cat <title-file>)" --body-file <body-file>
```

Return the PR URL. Red checks are expected.
