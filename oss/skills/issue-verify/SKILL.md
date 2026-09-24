---
name: issue-verify
description: Verify a GitHub issue is real and reproducible before any fix work starts. Checks the issue for a reproduction, asks the reporter for one if it's missing (using the repo's own issue template as the guide), writes a test that encodes the repro, and — once that test is confirmed failing for the right reason — pushes it, still failing, as a checkpoint commit marked `eddeee888:oss:issue-verify`. Use when asked to "verify issue #123", "triage this issue", "check if this bug is real/reproducible", or as the mandatory first step before fixing any reported bug. Pairs with the `issue-fix` skill, which builds its work directly on top of this checkpoint commit — the PR around it doesn't need to merge first.
---

# Verify a GitHub issue

Fixing a bug nobody can reproduce is a guess dressed up as a fix. This skill turns a reported issue into evidence: a concrete, failing test that proves the bug exists, or a specific, template-grounded ask back to the reporter when there isn't enough to go on yet. Nothing gets "fixed" here — that's `issue-fix`'s job. For a lighter, unverified read-only guess at root cause and size before this, see `issue-analyze`. This skill's job ends the moment the failing test is committed and pushed — it does **not** need that PR merged, or even green, first.

**This skill never runs `pr:pr-sync` itself.** The checkpoint PR is written from the test it opens with, so it starts current. After a further push to its branch, say in one line that the description may be stale and leave `/pr-sync` to the user (Step 6).

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Check for an existing checkpoint, then read the issue

```bash
git fetch origin --quiet
git log --all --oneline --grep="eddeee888:oss:issue-verify" | grep -F "#<number>"
```

Match found → stop. Tell the user a checkpoint already exists (name the commit and branch) and point them at `issue-fix` instead of re-verifying. Only proceed past this if the user explicitly wants to redo it (e.g. the original repro turned out wrong).

Nothing found → read the issue:

```bash
gh issue view <number> --json number,title,body,url,labels,state,comments \
  --jq '{number,title,body,url,state,labels:[.labels[].name],total:(.comments|length),comments:(.comments[-10:]|map({author:.author.login,body}))}'
```

That's the body and the last 10 comments. The repro isn't in them and `total` says there are more → read the earlier comments too.

Then find the repo's bug-report template. Get a `profile` of the repo from `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, when it's available (`CONVENTIONS.md` → "Consulting the `pr-sidekick` agent"): it names the bug-report template and its required fields, and Step 4 reuses it for the test layout. Read only that one template file. Not available → `ls .github/ISSUE_TEMPLATE/ 2>/dev/null` and read only the bug-report template — ask the user if it's unclear which one that is. Don't read every template.

Note the exact field the template uses for reproduction and its exact wording — you'll reuse it in Step 3 instead of asking generically.

## Step 2: Decide whether a reproduction already exists

Look through the issue body and comments for one of:

- A link to a live reproduction (CodeSandbox, StackBlitz, a minimal repo, a REPL).
- A self-contained code block that reproduces the bug end-to-end.
- Steps precise enough to reproduce without guessing: exact versions, exact API calls/inputs, expected vs. actual behavior.

"It doesn't work" or "throws an error sometimes" with none of the above doesn't count — that's Step 3, not Step 4.

## Step 3: No usable repro → draft a request, confirm, then post it

Point at the specific thing the template asks for, not a generic "please provide more info":

- Template has a reproduction field → name it: *"Could you share a link to a minimal reproduction? This issue template asks for one under '\<field name\>' — a CodeSandbox/StackBlitz link or a small repo works best."*
- No template → ask directly for exact package version(s), a minimal code sample, and expected vs. actual behavior.

Show the draft to the user before posting — "confirmed" means they've approved the wording, not that the reporter has replied. Then:

```bash
gh issue comment <number> --body "<confirmed draft>"
```

Stop here — there's nothing to test yet. This skill doesn't poll for a reply; re-run it once the reporter has responded.

## Step 4: Usable repro → write a failing test

Use the `profile` from Step 1, when there is one: the monorepo's package map, where tests live, and how to run a single test — so the test lands where this repo keeps its tests and runs the way its contributors run them. Not available → work these out from the repo as usual.

Find the package the repro actually exercises (in a monorepo, match its imports/API calls to the owning workspace — don't guess from the issue's labels alone).

Hand writing and running the test to one subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), with this prompt:

```text
Repo <owner>/<repo> (checked out). Package: <package the repro exercises>.
Tests live: <from the profile>; run one with: <command, or "find out">.
Repro (from issue #<number>): <the repro, verbatim — code, steps or link>
Expected: <expected behavior>. Actual: <what the issue reports>.

Write a test that mirrors the repro as closely as possible, asserting the
expected/correct behavior, not the buggy one. Run just that test with a quiet
or summary reporter. Confirm it fails for the reason the issue describes, not
because of a typo or wrong setup in the test itself. Don't skip it, don't
commit, don't push.
Return at most 5 lines: test path, the failure in one or two lines, and
whether it matches the issue (yes/no, why).
```

It doesn't fail the way the issue claims → that's a finding too. Discard the test and go back to the reporter (Step 3) with what was found, instead of forcing a red test that proves the wrong thing.

## Step 5: Leave it failing, commit it as the checkpoint, open the PR

- Leave the test failing — don't skip it, don't mark it pending. A skipped test goes invisible to CI; a failing one is the checkpoint this skill exists to produce. It's fine, expected even, for this PR's checks to be red.
- Commit it on a new branch named `repro/<issue-number>` (paired with `issue-fix`'s `fix/<issue-number>` — `CONVENTIONS.md` → "Checkpoint/fix branch naming"), with the marker `eddeee888:oss:issue-verify` as the last line of the commit message — a plain trailer, not prose, so it's reliably grep-able later:

  ```
  test: reproduce #123 — <short bug description>

  eddeee888:oss:issue-verify
  ```
- Push it, then open the PR as a **draft**, referencing the issue with a non-closing keyword, per this marketplace's shared convention (`CONVENTIONS.md` → "Non-closing issue references") — this PR doesn't fix anything yet, so don't use `Fixes`/`Closes`.
- Title convention: `test: reproduce <short bug description> (failing) (#123)` — the issue reference goes at the end (`CONVENTIONS.md` → "Trailing issue reference"). In a monorepo, apply the shared `[package-name]` prefix (`CONVENTIONS.md` → "Monorepo title prefix"), prefixed with the package the repro actually exercises (the one Step 4 identified) — e.g. `[package-name] test: reproduce <short bug description> (failing) (#123)`.
- Body: state plainly that this is a checkpoint proving the bug exists, link the failing run/output you captured in Step 4, and note that `issue-fix` builds its work directly on top of this commit — this PR doesn't need to merge, or even go green, before that happens.

```bash
gh pr create --draft --title "test: reproduce <short bug description> (failing) (#123)" --body "<body>"
```

## Step 6: Suggest a sync after further pushes

Don't run `pr:pr-sync`. The PR just opened already matches its branch. After any further push to the same branch, end the report with one line saying the description may now be stale and `/pr-sync` will update it.

## When to stop instead of proceeding

- A checkpoint already exists for this issue → stop at Step 1, point at `issue-fix` instead of verifying it a second time.
- No repro and the reporter hasn't confirmed the ask yet → post the request (Step 3) and stop. Don't write a speculative test against an unconfirmed guess at the bug.
- The test doesn't fail the way the issue describes → don't commit and push it; go back to the reporter with what you actually found.
- Tempted to skip the test so the PR's checks come back green → don't. Leave it red.
