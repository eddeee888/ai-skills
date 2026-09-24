---
name: issue-fix
description: Turn an `issue-verify` checkpoint commit into an actual fix. Locates the failing test behind the `eddeee888:oss:issue-verify` marker (same branch or a different one), root-causes it, works out whether the bug lives in this library or in a dependency, presents the user 2-3 concrete fix options with pros/cons, then implements whichever they pick — building directly on top of the checkpoint commit — committing it with the `eddeee888:oss:issue-fix` marker as the last commit-message line, and pushing it. By default, builds on top of the checkpoint's own PR; pass `--new-pr` to open a separate fix PR instead. Use when asked to "fix issue #123", "implement the fix for #123", or right after an `issue-verify` checkpoint commit exists. This skill does not write the reproduction itself, `issue-verify` does, and does not require that checkpoint's PR to be merged — only for the commit to exist. It never runs `pr:pr-sync` itself; it suggests it after pushing.
---

# Fix a verified issue

Second half of the TDD loop `issue-verify` started: a failing test already exists, committed with an `eddeee888:oss:issue-verify` marker, proving the bug is real. This skill makes that test pass for real, and makes the fix decision *with* the user instead of for them — a bug rooted in a dependency wants a different response than one rooted in this repo's own code, and the user should choose the trade-off before code gets written.

**This skill never runs `pr:pr-sync` itself.** A sync is a long rebase-and-redraft loop. When a push leaves a PR's description behind its branch, say so in one line and leave `/pr-sync` to the user (Step 7).

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Find the `issue-verify` checkpoint commit

The failing test could be on the branch you're already on or a completely different one — don't assume, look:

```bash
git fetch origin --quiet
git log --all --oneline --grep="eddeee888:oss:issue-verify"
```

Nothing found → stop, ask the user where it lives rather than guessing a starting point. More than one match → disambiguate using the issue number in the commit message.

This commit is your base for everything that follows. By default, building the fix on top of the checkpoint's own PR is fine — that's one PR going from red to green, the simpler reviewer experience. Pass `--new-pr` when invoking this skill to force a separate fix PR instead (e.g. the checkpoint PR isn't yours to push more commits to, or the fix genuinely warrants its own review):

- Already in the current branch's history, and `--new-pr` wasn't passed → keep working right here, no new branch needed; the checkpoint's PR becomes the fix PR.
- Otherwise (a different branch, or `--new-pr` was passed) → branch from the checkpoint commit directly, not from the base branch's tip: `git checkout -b fix/<issue-number> <verify-commit-sha>` — paired with `issue-verify`'s `repro/<issue-number>` naming (`CONVENTIONS.md` → "Checkpoint/fix branch naming"). The checkpoint's PR doesn't need to be merged for this.

## Step 2: Re-root-cause it

Run just the failing test locally, with the runner's quiet or summary reporter so only the failure lands in context, and read the actual failure (stack trace, assertion diff, error type) — the checkpoint commit may have surfaced something more specific than the issue. Read the issue thread again only when the failure doesn't match what the checkpoint commit message says.

## Step 3: Is the bug ours, or a dependency's?

- **Ours** — originates in this repo's own code path.
- **A dependency's** — originates in a direct or transitive dependency. Pin down which one, which version, and the evidence (the exact function/file in its source, a matching upstream issue/changelog entry).

This decides what options make sense next — don't skip to "how do we fix it" before knowing which side of the boundary the bug is on.

Hand the tracing to an exploring subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), so the files it reads — including a dependency's source — stay out of this chat. Pass the failing test's path and the failure summary; ask for ours or a dependency's, the exact function/file, and the evidence (for a dependency: which one, which version, any upstream issue or changelog entry), then 2–3 fix options shaped as in Step 4 with what each changes, blast radius, risk, and rough effort — a line or two each. Present the options from its answer; don't open code here to size them.

## Step 4: Present 2-3 options, and ask

Sized to what Step 3 found:

- Ours: fix it directly vs. a narrower/more defensive fix vs. a larger refactor that also prevents the class of bug.
- Dependency's: upgrade to the version that already fixes it vs. patch/override locally (lockfile override or vendored patch) with a tracked upstream issue vs. work around it in our own code.

For each option: what changes, blast radius, risk, rough effort. Ask which they want — don't default to whichever's fastest.

## Step 5: Implement the chosen option

Get a `profile` of the repo and a `brief` in one call (`profile` + `brief`) from `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor (`CONVENTIONS.md` → "Consulting the `pr-sidekick` agent"), passing the files the chosen option touches and a one-line summary of it. The profile says how to run the affected package's tests and whether Step 6's title needs a package prefix; the brief brings the rules the user's reviewers have already asked for that apply to this change. When the user explicitly asked to remember something for the team, also pass `record-team: <one line>` on this call and on the `check-diff` call below. It lives in the `pr` plugin; not installed → skip it.

Then hand the edit/test/commit loop to one subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), with this prompt:

```text
Repo <owner>/<repo>, branch <branch> (already checked out), on top of
checkpoint commit <verify-commit-sha> (marked eddeee888:oss:issue-verify).
Failing test: <path> — run it with: <command from the profile, or "find out">
Fix to make: <the chosen option, in two or three lines>
Rules that apply: <brief lines, or "none">

Make only this fix, nothing broader. The failing test is the acceptance
criterion. Never rewrite, squash, or drop the checkpoint commit.
Run the affected package's tests with a quiet or summary reporter, reading
only failures, until the failing test passes for the right reason and
nothing else regressed. Then commit, with this message ending in the marker:
  fix: <short description> (#<issue number>)

  eddeee888:oss:issue-fix
Do not push. If the fix needs more than the chosen option, stop and say why.
Return at most 5 lines: files changed, commit sha, tests run and result,
or why you stopped.
```

Then run `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, in `check-diff` mode against the checkpoint commit. Anything it flags within the chosen option's scope → one follow-up subagent with just the flags and the sha, same prompt shape. The subagent stopped → bring its reason back to the user before going further.

A later `pr:pr-sync` rebase still replays the checkpoint's SHA but leaves its content and trailer untouched — that's not the kind of rewrite the prompt rules out.

## Step 6: Push — open a new PR only when Step 1 branched off (or `--new-pr` was passed)

Push the Step 1 branch. Check first whether it already has an open PR:

```bash
gh pr view --json number 2>&1
```

- **Continuing the checkpoint's PR** (Step 1's default case — same branch, `--new-pr` not passed) → just `git push`. Never run `gh pr create` here — it either errors on a branch that already has an open PR, or opens a second PR for what should stay one. Its title and description still describe the checkpoint — Step 7 covers that.
- **A separate fix PR** (Step 1's `--new-pr` case, or a checkpoint on a different branch) → push and open one as a draft. In a monorepo, apply this marketplace's shared `[package-name]` prefix (`CONVENTIONS.md` → "Monorepo title prefix"), prefixed with the package Step 3's root-cause tracing pointed at, not whichever package the issue was filed under — e.g. `[package-name] fix: <short description of the fix> (#<issue number>)`.

  ```bash
  gh pr create --draft --title "fix: <short description of the fix> (#<issue number>)" --body "<body>"
  ```

Reference the issue with a non-closing keyword, per this marketplace's shared convention (`CONVENTIONS.md` → "Non-closing issue references") — never `Fixes #123`/`Closes #123`, even though this PR resolves it. State which option was chosen and why in a sentence or two — the options were already discussed with the user, no need to re-litigate them.

## Step 7: Suggest a sync

Don't run `pr:pr-sync`. A separate fix PR was just written from the fix, so it's current. When the push continued the checkpoint's PR, or went to a PR that already existed, end the report with one line saying its title and description may now be stale and `/pr-sync` will update them.

## When to stop instead of proceeding

- No `eddeee888:oss:issue-verify` commit found anywhere → stop at Step 1, say so, ask the user where it lives rather than guessing a base to build on.
- Root cause still unclear after Step 2/3 → don't guess an option set; go back to the issue/reporter (or `issue-verify`) for more signal before presenting choices.
- User hasn't picked an option yet → don't implement a "likely" default; wait for their answer.
