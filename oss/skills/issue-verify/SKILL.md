---
name: issue-verify
description: Verify a GitHub issue is real and reproducible before any fix work starts. Checks the issue for a reproduction, asks the reporter for one if it's missing (guided by the repo's issue template), writes a test encoding the repro, and — once it's confirmed failing for the right reason — pushes it, still failing, as a checkpoint commit with the `Skill: oss:issue-verify` trailer. Use when asked to "verify issue #123", "triage this issue", "check if this bug is real/reproducible", or as the mandatory first step before fixing any reported bug. Pairs with the `issue-fix` skill, which builds directly on this checkpoint commit — its PR doesn't need to merge first.
---

# Verify a GitHub issue

Fixing a bug nobody can reproduce is a guess. This skill turns a reported issue into evidence: a failing test proving the bug exists, or a template-grounded ask back to the reporter when there isn't enough to go on. Nothing gets fixed here — that's `issue-fix`. For a lighter, unverified read-only guess at root cause and size first, see `issue-analyze`. The job ends once the failing test is committed and pushed — the PR need not be merged, or green.

**This skill never runs `cops:pr-sync` itself.** The checkpoint PR is written from the test it opens with and pushed to only once, so it's always current.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Check for an existing checkpoint, then read the issue

Cheap, exact checks first — a checkpoint branch by its conventional name, and a checkpoint in the current branch's history:

```bash
git ls-remote --heads origin "repro/<number>"
git log --oneline --grep='^Skill: oss:issue-verify$' --grep='^eddeee888:oss:issue-verify$' HEAD | grep -E "#<number>([^0-9]|$)"
```

Both empty → one wider sweep, since a checkpoint can sit on a differently named branch:

```bash
git fetch origin --quiet
git log --all --oneline --grep='^Skill: oss:issue-verify$' --grep='^eddeee888:oss:issue-verify$' | grep -E "#<number>([^0-9]|$)"
```

The `([^0-9]|$)` keeps `#12` from matching `#123`.

Match found → stop. Tell the user a checkpoint exists (name the commit and branch) and point them at `issue-fix`. Proceed only if the user explicitly wants to redo it (e.g. the original repro was wrong).

Nothing found → read the issue:

```bash
gh issue view <number> --json number,title,body,url,labels,state,comments \
  --jq '{number,title,body,url,state,labels:[.labels[].name],total:(.comments|length),comments:(.comments[-10:]|map({author:.author.login,body}))}'
```

That's the body and last 10 comments. Repro not in them and `total` says there are more → read the earlier comments too.

Then find the repo's bug-report template. When available, get the repo's profile (`scout-repo`) from `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"): it names the bug-report template and its required fields, and Step 4 reuses it for the test layout. Read only that template file. Not available → `ls .github/ISSUE_TEMPLATE/ 2>/dev/null` and read only the bug-report template — ask the user if it's unclear which. No such directory → check for a single `.github/ISSUE_TEMPLATE.md`. Don't read every template.

Note the template's reproduction field and its exact wording — Step 3 reuses it instead of asking generically.

## Step 2: Decide whether a reproduction already exists

Look through the issue body and comments for one of:

- A link to a live reproduction (CodeSandbox, StackBlitz, a minimal repo, a REPL).
- A self-contained code block that reproduces the bug end-to-end.
- Steps precise enough to reproduce without guessing: exact versions, exact API calls/inputs, expected vs. actual behavior.

"It doesn't work" or "throws an error sometimes" with none of the above doesn't count — that's Step 3, not Step 4.

## Step 3: No usable repro → draft a request, confirm, then post it

Point at what the template asks for, not a generic "please provide more info":

- Template has a reproduction field → name it: *"Could you share a link to a minimal reproduction? This issue template asks for one under '\<field name\>' — a CodeSandbox/StackBlitz link or a small repo works best."*
- No template → ask for exact package version(s), a minimal code sample, and expected vs. actual behavior.

Show the draft to the user before posting — "confirmed" means they approved the wording, not that the reporter replied. End the body with the `oss:issue-verify` signature and the `✓ <login>` approval — the user confirmed it (`CONVENTIONS.md` → "Skill signature"). Then write it to a file and post from there — never inline in `--body "…"` (`CONVENTIONS.md` → "Passing drafted text to `gh`"):

```bash
gh issue comment <number> --body-file <file>
```

Stop — there's nothing to test yet. This skill doesn't poll for a reply; re-run it once the reporter responds.

## Step 4: Usable repro → write a failing test

Use Step 1's profile, when there is one — the monorepo's package map, where tests live, and how to run a single test — so the test lands and runs the way this repo's contributors do it. Not available → work these out from the repo.

Find the package the repro exercises (in a monorepo, match its imports/API calls to the owning workspace — don't guess from the issue's labels alone).

Hand writing and running the test to one subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), with this prompt:

```text
Repo <owner>/<repo> (checked out). Package: <package the repro exercises>.
Tests live: <from the profile>; run one with: <command, or "find out">.
Repro (from issue #<number>): <the repro, verbatim — code, steps or link>
Expected: <expected behavior>. Actual: <what the issue reports>.

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

It doesn't fail the way the issue claims → that's a finding. Discard the test and go back to the reporter (Step 3) with what was found, rather than forcing a red test that proves the wrong thing.

## Step 5: Leave it failing, commit it as the checkpoint, open the PR

- Leave the test failing — don't skip it or mark it pending. A skipped test is invisible to CI; the failing one is the checkpoint this skill exists to produce. Red checks on this PR are expected.
- Commit it on a new branch `repro/<issue-number>` (paired with `issue-fix`'s `fix/<issue-number>` — `CONVENTIONS.md` → "Checkpoint/fix branch naming"), with the trailer `Skill: oss:issue-verify` in the message's final paragraph, so it stays grep-able. No `Approved-by:` — the user didn't OK this commit (`CONVENTIONS.md` → "Commit trailers"):

  ```
  test: reproduce #123 — <short bug description>

  Skill: oss:issue-verify
  ```
- Push, then open the PR as a **draft**, referencing the issue with a non-closing keyword (`CONVENTIONS.md` → "Non-closing issue references") — this PR fixes nothing yet, so no `Fixes`/`Closes`.
- Title: `test: reproduce <short bug description> (failing) (#123)` — issue reference at the end (`CONVENTIONS.md` → "Trailing issue reference"). In a monorepo, apply the shared `[package-name]` prefix (`CONVENTIONS.md` → "Monorepo title prefix") with the package Step 4 identified — e.g. `[package-name] test: reproduce <short bug description> (failing) (#123)`.
- Body: state that this is a checkpoint proving the bug exists, quote the failure captured in Step 4 (test name and the one or two lines of assertion output — CI hasn't run yet, so there's no run to link), and note that `issue-fix` builds directly on this commit — this PR needn't merge, or go green, first.

Write the title and body to files first, then (`CONVENTIONS.md` → "Passing drafted text to `gh`"):

```bash
gh pr create --draft --title "$(cat <title-file>)" --body-file <body-file>
```

## Step 6: Wrap up

Don't run or suggest `cops:pr-sync` — the new PR already matches its branch. Report the PR URL; the report ends with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with labels `scout-repo` and `test loop`.

## When to stop instead of proceeding

- A checkpoint already exists for this issue → stop at Step 1, point at `issue-fix`.
- No usable repro → post the request once the user approves its wording (Step 3), and stop. Don't write a speculative test against a guess at the bug.
- The test doesn't fail the way the issue describes → don't commit or push it; go back to the reporter with what you found.
- Tempted to skip the test so the PR's checks go green → don't. Leave it red.
