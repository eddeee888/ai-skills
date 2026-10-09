---
name: issue-fix
description: 'Fix a verified issue from an `issue-verify` failing-test checkpoint. Root-cause it, distinguish library from dependency bugs, present 2–3 options, then implement the chosen fix on the checkpoint, commit with required trailers, and push; `--new-pr` opens a separate PR. Use for “fix issue #123,” “implement the fix for #123,” or after an `issue-verify` checkpoint. Never writes the reproduction or runs `cops:pr-sync`.'
---

# Fix a verified issue

Continue the TDD loop from an `issue-verify` failing-test checkpoint. Make the test pass only after the root cause is classified and the user chooses among concrete options.

**This skill never runs `cops:pr-sync` itself.** When a push leaves a PR's description behind its branch, suggest it instead (`CONVENTIONS-orchestration.md` → "Suggesting next steps", Step 7).

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS-github.md` → "GitHub access").

## Step 1: Find the `issue-verify` checkpoint commit

Before discovery, explicitly read `../checkpoint.md`, then follow its numbered or no-issue-number path as applicable, including local/remote checks, anchored trailer matching, exact issue-number guarding, and sentinels. With no issue number, list every candidate and ask which issue when more than one exists; never choose one. `CHECKPOINT_NOT_FOUND` → stop and ask where it lives. `CHECKPOINT_AMBIGUOUS` → ask which issue. `CHECKPOINT_FOUND` → retain its commit SHA and branch as the base for everything below.

By default build on the checkpoint's own PR. `--new-pr` forces a separate fix PR:

- In the current branch's history, no `--new-pr` → keep working here; the checkpoint's PR becomes the fix PR.
- On another branch (e.g. `repro/<issue-number>`), no `--new-pr` → check it out (`git switch <branch>`, or `git switch -c <branch> --track origin/<branch>` if it's only on the remote) and work there; its PR becomes the fix PR. Can't push to that branch (someone else's fork or branch) → say so and fall through to the next case.
- `--new-pr`, or an unpushable checkpoint branch → branch from the checkpoint commit, not the base tip: `git checkout -b fix/<issue-number> <verify-commit-sha>` (`CONVENTIONS-pr-metadata.md` → "Checkpoint/fix branch naming"). The checkpoint PR need not merge.

## Step 2: Re-root-cause it

Get `scout-repo` from `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"): one-test command, test layout, package map, and title prefix. If unavailable, discover these locally.

Run only the failing test with a quiet/summary reporter and read the stack, assertion diff, and error type. Re-read the issue thread only if the failure conflicts with the checkpoint message.

## Step 3: Is the bug ours, or a dependency's?

Explicitly read `./options.md`. Delegate root-cause tracing and shape 2–3 options exactly as it specifies (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"). Do not jump to solutions before classifying the cause as ours or a direct/transitive dependency's with evidence.

## Step 4: Present 2-3 options, and ask

Present the 2–3 options returned by `./options.md`, each with changes, blast radius, risk, and rough effort. Ask which the user wants. This is a hard gate: do not choose the fastest, infer approval, edit code, or run an implementation loop before selection.

## Step 5: Implement the chosen option

Only after selection, explicitly read `./fix-loop.md`. Follow its oracle order, chosen-option implementation prompt, test/attempt cap, commit trailers, `sweep-diff` follow-up, and return shape. If the loop stops, bring its reason to the user before continuing.

## Step 6: Push — open a new PR only when the branch has none

Check the actual branch for an open PR:

```bash
gh pr view --json number,author 2>&1
```

- **Has one** → `git push` only. Never run `gh pr create`; preserve `author.login` for wrap-up.
- **Has none** → `git push -u origin <branch>` and open a draft PR. In a monorepo use the package Step 3's tracing identified as owning the affected code path, not the issue label, for `[package-name]` (`CONVENTIONS-pr-metadata.md` → "Monorepo title prefix"). Title: `[package-name] fix: <short description> (#<issue number>)`, with issue reference last (`CONVENTIONS-pr-metadata.md` → "Trailing issue reference"). Link body sources (`CONVENTIONS-posts.md` → "Citing sources") and write title/body files (`CONVENTIONS-github.md` → "Passing drafted text to `gh`"):

  ```bash
  gh pr create --draft --title "$(cat <title-file>)" --body-file <body-file>
  ```

Use a non-closing issue reference, never `Fixes #123`/`Closes #123` (`CONVENTIONS-pr-metadata.md` → "Non-closing issue references"). State the chosen option and why briefly.

## Step 7: Wrap up

Never run `cops:pr-sync` or `cops:pr-note`; suggest them per `CONVENTIONS-orchestration.md` → "Suggesting next steps". A new fix PR needs no sync; a pushed existing checkpoint PR may. End with handoffs (`CONVENTIONS-orchestration.md` → "Handoffs in the final report"), labels `scout-repo`, `root cause`, `brief-task`, `fix loop`, and `sweep-diff`.

## When to stop instead of proceeding

- No `oss:issue-verify` checkpoint commit found anywhere → stop at Step 1, say so, ask the user where it lives rather than guessing a base.
- More than one checkpoint and no issue selected → ask; do not choose.
- The checkpoint test no longer fails as expected → stop before root-cause options and report the mismatch.
- Root cause still unclear after Step 2/3 → don't guess an option set; go back to the issue/reporter (or `issue-verify`) for more signal first.
- User hasn't picked an option → don't implement a "likely" default; wait.
- The implementation needs more than the chosen option or still fails after three attempts → stop without pushing.
