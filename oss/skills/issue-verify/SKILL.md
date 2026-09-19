---
name: issue-verify
description: Verify a GitHub issue is real and reproducible before any fix work starts. Checks the issue for a reproduction, asks the reporter for one if it's missing (using the repo's own issue template as the guide), writes a test that encodes the repro, and — once that test is confirmed failing for the right reason — pushes it, still failing, as a checkpoint commit marked `eddeee888:oss:issue-verify`. Use when asked to "verify issue #123", "triage this issue", "check if this bug is real/reproducible", or as the mandatory first step before fixing any reported bug. Pairs with the `issue-fix` skill, which builds its work directly on top of this checkpoint commit — the PR around it doesn't need to merge first.
---

# Verify a GitHub issue

Fixing a bug nobody can reproduce is a guess dressed up as a fix. This skill turns a reported issue into evidence: either a concrete, failing test that proves the bug exists, or a specific, template-grounded ask back to the reporter when there isn't enough to go on yet. Nothing gets "fixed" here — that's `issue-fix`'s job. For a lighter, unverified read-only guess at root cause and size before committing to this work, see `feature-analyze` — this skill is the step that turns that guess into proof. This skill's job ends the moment the failing test is committed and pushed — it does **not** need that PR merged, or even green, before `issue-fix` picks up from it.

**Every step that pushes a commit ends by running `pr:pr-sync`.** Once the PR exists, it's the source of truth for title/description/changeset — never leave it stale after a push, even a small one.

## Step 1: Check for an existing checkpoint, then read the issue

Before doing anything else, check whether this issue already has a checkpoint from a previous run:

```bash
git fetch origin --quiet
git log --all --oneline --grep="eddeee888:oss:issue-verify" | grep -F "#<number>"
```

Match found → stop. Tell the user a checkpoint already exists (name the commit and branch) and point them at `issue-fix` instead of re-verifying from scratch. Only proceed past this if the user explicitly wants to redo it (e.g. the original repro turned out wrong).

Nothing found → read the issue and the repo's own template:

```bash
gh issue view <number> --json number,title,body,url,labels,state,comments
ls .github/ISSUE_TEMPLATE/ 2>/dev/null
cat .github/ISSUE_TEMPLATE/*.md .github/ISSUE_TEMPLATE/*.yml 2>/dev/null
```

Note the exact field the template uses for reproduction (a "Reproduction" field asking for a CodeSandbox/StackBlitz/repo link, a "Steps to reproduce" field, etc.) and its exact wording — you'll reuse it in Step 3 instead of asking generically.

## Step 2: Decide whether a reproduction already exists

Look through the issue body and its comments for one of:

- A link to a live reproduction (CodeSandbox, StackBlitz, a minimal repo, a REPL).
- A self-contained code block that reproduces the bug end-to-end.
- Steps precise enough to reproduce without guessing: exact versions, exact API calls/inputs, expected vs. actual behavior.

"It doesn't work" or "throws an error sometimes" with none of the above doesn't count — that's Step 3, not Step 4.

## Step 3: No usable repro → draft a request, confirm, then post it

Point at the specific thing the template asks for, rather than a generic "please provide more info":

- Template has a reproduction field → name it: *"Could you share a link to a minimal reproduction? This issue template asks for one under '\<field name\>' — a CodeSandbox/StackBlitz link or a small repo works best."*
- No template → ask directly for exact package version(s), a minimal code sample, and expected vs. actual behavior.

Show the draft to the user before posting — "confirmed" means they've approved the wording, not that the reporter has replied. Then:

```bash
gh issue comment <number> --body "<confirmed draft>"
```

Stop here — there's nothing to test yet. This skill doesn't poll for a reply; re-run it once the reporter has responded.

## Step 4: Usable repro → write a failing test

Find the package the repro actually exercises (in a monorepo, match its imports/API calls to the owning workspace — don't guess from the issue's labels alone).

Write a test that mirrors the repro as closely as possible — same inputs, same setup, same call — asserting the **expected/correct** behavior, not the buggy one.

Run it and read the failure. Confirm it fails for the reason the issue describes, not because of a typo or wrong setup in the test itself. If it doesn't fail the way the issue claims, that's a finding too — go back to the reporter (Step 3) with what you found instead of forcing a red test that proves the wrong thing.

## Step 5: Leave it failing, commit it as the checkpoint, open the PR

- Leave the test failing — don't skip it, don't mark it pending, don't reach for any "expected to fail" idiom. A skipped test goes invisible to CI; a failing one is the checkpoint this skill exists to produce. It's fine, expected even, for this PR's checks to be red.
- Commit it on a new branch named `repro/<issue-number>` (paired with `issue-fix`'s `fix/<issue-number>` convention — see `CONVENTIONS.md` at the repo root), with the marker `eddeee888:oss:issue-verify` as the last line of the commit message — a plain trailer, not prose, so it's reliably grep-able later regardless of which branch or PR it ends up on:

  ```
  test: reproduce #123 — <short bug description>

  eddeee888:oss:issue-verify
  ```
- Push it, then open the PR as a **draft**, referencing the issue with a non-closing keyword, per this marketplace's shared convention (see `CONVENTIONS.md` at the repo root) — this PR doesn't fix anything yet, so don't use `Fixes`/`Closes`.
- Title convention: `test: reproduce <short bug description> (failing) (#123)` — the issue reference goes at the end, per this marketplace's shared trailing-reference convention (`CONVENTIONS.md`). In a monorepo, apply the shared `[package-name]` title-prefix convention (`CONVENTIONS.md`), prefixed with the package the repro actually exercises (the one Step 4 identified).
- Body: state plainly that this is a checkpoint proving the bug exists, link the failing run/output you captured in Step 4, and note that `issue-fix` builds its work directly on top of this commit — this PR doesn't need to merge, or even go green, before that happens.

```bash
gh pr create --draft --title "test: reproduce <short bug description> (failing) (#123)" --body "<body>"
```

## Step 6: Sync

Run `pr:pr-sync` right after opening the PR, and again after any further push to the same branch (e.g. wording changes to the test or PR body) — never leave the PR description behind the branch.

## When to stop instead of proceeding

- A checkpoint already exists for this issue → stop at Step 1, point at `issue-fix` instead of verifying it a second time.
- No repro and the reporter hasn't confirmed the ask yet → post the request (Step 3) and stop. Don't write a speculative test against an unconfirmed guess at the bug.
- The test doesn't fail the way the issue describes → don't commit and push a test that "passes" for the wrong reason or fails for an unrelated one; go back to the reporter with what you actually found.
- Tempted to skip the test so the PR's checks come back green → don't. A green check here hides the exact thing this skill exists to surface; leave it red.
- No open PR yet when you'd otherwise sync → that's expected before Step 5; `pr:pr-sync` only applies once the checkpoint PR exists.
