---
name: verify
description: Verify a GitHub issue is real and reproducible before any fix work starts. Checks the issue for a reproduction, asks the reporter for one if it's missing (using the repo's own issue template as the guide), writes a test that encodes the repro, and — once that test is confirmed failing for the right reason — pushes it as a skipped "base test" PR. Use when asked to "verify issue #123", "triage this issue", "check if this bug is real/reproducible", or as the mandatory first step before fixing any reported bug. Pairs with the `fix` skill, which only starts once this skill's PR is merged.
---

# Verify a GitHub issue

Fixing a bug nobody can reproduce is a guess dressed up as a fix. This skill turns a reported issue into evidence: either a concrete, failing test that proves the bug exists, or a specific, template-grounded ask back to the reporter when there isn't enough to go on yet. Nothing gets "fixed" here — that's the `fix` skill's job, and it only starts once this skill's PR has merged.

**Every step below that pushes a commit to the base-test branch ends by running the `pr-sync-changes` skill.** Once the PR exists, it is the source of truth for title/description/changeset — never leave it stale after a push, even a small one (skip → PR, PR → tweak, doesn't matter).

## Step 1: Read the issue and the repo's own template

```bash
gh issue view <number> --json number,title,body,url,labels,state,comments
```

Then check whether the repo asks for a reproduction, and how:

```bash
ls .github/ISSUE_TEMPLATE/ 2>/dev/null
cat .github/ISSUE_TEMPLATE/*.md .github/ISSUE_TEMPLATE/*.yml 2>/dev/null
```

Note the exact field the template uses for reproduction (a "Reproduction" field asking for a CodeSandbox/StackBlitz/repo link, a "Steps to reproduce" field, etc.) and its exact wording. You'll reuse it in Step 3 instead of asking generically.

## Step 2: Decide whether a reproduction already exists

Look through the issue body and its comments for one of:

- A link to a live reproduction (CodeSandbox, StackBlitz, a minimal repo, a REPL).
- A self-contained code block that reproduces the bug end-to-end.
- Steps precise enough to reproduce without guessing: exact versions, exact API calls/inputs, expected vs. actual behavior.

A description like "it doesn't work" or "throws an error sometimes" with none of the above does **not** count — that's Step 3, not Step 4.

## Step 3: No usable repro → draft a request, confirm, then post it

Draft a comment that points at the specific thing the template asks for, rather than a generic "please provide more info":

- If the template has a reproduction field, name it: *"Could you share a link to a minimal reproduction? This issue template asks for one under '\<field name\>' — a CodeSandbox/StackBlitz link or a small repo works best."*
- If there's no template, ask directly for: exact package version(s), a minimal code sample, and expected vs. actual behavior.

Show the draft to the user before posting — "confirmed" means they've approved the wording, not that the reporter has replied yet. Then:

```bash
gh issue comment <number> --body "<confirmed draft>"
```

Stop here. There is nothing to test yet. This skill doesn't poll for a reply — re-run it once the reporter has responded.

## Step 4: Usable repro → write a failing test

Find the package the repro actually exercises (in a monorepo, match the repro's imports/API calls to the owning workspace, don't guess from the issue's labels alone).

Write a test that mirrors the repro as closely as possible — same inputs, same setup, same call the reporter made — asserting the **expected/correct** behavior, not the buggy one.

Run it and read the failure. Confirm it fails for the reason the issue describes, not because of a typo or wrong setup in the test itself. If it doesn't fail the way the issue claims, that's a finding too — go back to the reporter (Step 3) with what you found instead of forcing a red test that proves the wrong thing.

## Step 5: Skip the test and open the base PR

- Mark the test skipped using whatever idiom the rest of the repo's test suite already uses (`.skip`, `@pytest.mark.skip(...)`, `xit`, etc. — don't introduce a new pattern), with a short comment linking the issue, e.g. `// skipped: reproduces #123, unskip once fixed`.
- Commit and push on a new branch.
- Open the PR as a **draft**, referencing the issue with a non-closing keyword (`Relates to #123` / `Refs #123` — this PR doesn't fix anything yet, so don't use `Fixes`/`Closes`).
- Title convention: `test: reproduce #123 — <short bug description> (skipped)`.
- Body: state plainly that this is a base test proving the bug exists, link the failing run/output you captured in Step 4, and note that the fix lands in a follow-up PR once this one merges.

```bash
gh pr create --draft --title "test: reproduce #123 — <short description> (skipped)" --body "<body>"
```

## Step 6: Sync

Immediately after opening the PR, run the `pr-sync-changes` skill. Do the same after any further push this skill makes to the same branch (e.g. if the user asks for wording changes to the test or PR body) — never leave the PR description behind the branch.

## When to stop instead of proceeding

- No repro and the reporter hasn't confirmed the ask yet → post the request (Step 3) and stop. Don't write a speculative test against an unconfirmed guess at the bug.
- The test doesn't fail the way the issue describes → don't skip-and-push a test that "passes" for the wrong reason or fails for an unrelated one; go back to the reporter with what you actually found.
- No open PR yet when you'd otherwise sync → that's expected before Step 5; `pr-sync-changes` only applies once the base-test PR exists.
