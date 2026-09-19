---
name: issue-fix
description: Turn an `issue-verify` checkpoint commit into an actual fix. Locates the failing test behind the `eddeee888:oss:issue-verify` marker (same branch or a different one), root-causes it, works out whether the bug lives in this library or in a dependency, presents the user 2-3 concrete fix options with pros/cons, then implements whichever they pick — building directly on top of the checkpoint commit — committing it with the `eddeee888:oss:issue-fix` marker as the last commit-message line, and pushing it. By default, builds on top of the checkpoint's own PR; pass `--new-pr` to open a separate fix PR instead. Use when asked to "fix issue #123", "implement the fix for #123", or right after an `issue-verify` checkpoint commit exists. This skill does not write the reproduction itself, `issue-verify` does, and does not require that checkpoint's PR to be merged — only for the commit to exist. Every push in this skill re-syncs via the `pr:pr-sync` skill.
---

# Fix a verified issue

Second half of the TDD loop `issue-verify` started: a failing test already exists, committed with an `eddeee888:oss:issue-verify` marker, proving the bug is real. This skill makes that test pass for real, and makes the fix decision *with* the user instead of for them — a bug rooted in a dependency wants a different response than one rooted in this repo's own code, and the user should choose the trade-off before code gets written.

**Every push this skill makes ends by running `pr:pr-sync`** — the fix PR's description should always match what's actually on its branch, including through mid-review pushes.

## Step 1: Find the `issue-verify` checkpoint commit

The failing test could be on the branch you're already on (continuing the PR `issue-verify` opened) or a completely different one — don't assume, look:

```bash
git fetch origin --quiet
git log --all --oneline --grep="eddeee888:oss:issue-verify"
```

Nothing found → stop, ask the user where it lives (a different fork/remote, or `issue-verify` genuinely hasn't run) rather than guessing a starting point. More than one match → disambiguate using the issue number in the commit message.

This commit is your base for everything that follows. By default, building the fix on top of the checkpoint's own PR is fine — that's one PR going from red to green, which is the simpler reviewer experience. Pass `--new-pr` when invoking this skill to force a separate fix PR instead (e.g. the checkpoint PR isn't yours to push more commits to, or the fix genuinely warrants its own review separate from the repro):

- Already in the current branch's history, and `--new-pr` wasn't passed → keep working right here, no new branch needed; the checkpoint's PR becomes the fix PR.
- Otherwise (a different branch, or `--new-pr` was passed) → branch from the checkpoint commit directly, not from the base branch's tip: `git checkout -b fix/<issue-number> <verify-commit-sha>` — paired with `issue-verify`'s `repro/<issue-number>` naming (see `CONVENTIONS.md` at the repo root). The checkpoint's PR doesn't need to be merged for this — building on top of the commit is enough.

## Step 2: Re-root-cause it

Pull up the failing test and the issue thread again. Run the test locally and read the actual failure (stack trace, assertion diff, error type) — don't rely on memory of what the issue said; the checkpoint commit may have surfaced something more specific.

## Step 3: Is the bug ours, or a dependency's?

Trace the failure to its actual origin:

- **Ours** — originates in this repo's own code path.
- **A dependency's** — originates in a direct or transitive dependency. Pin down which one, which version, and the evidence (the exact function/file in its source, a matching upstream issue/changelog entry).

This decides what options make sense next — don't skip to "how do we fix it" before knowing which side of the boundary the bug is on.

## Step 4: Present 2-3 options, and ask

Draft 2-3 concrete approaches — not a token "do nothing" — sized to what Step 3 found:

- Ours: fix it directly vs. a narrower/more defensive fix vs. a larger refactor that also prevents the class of bug.
- Dependency's: upgrade to the version that already fixes it vs. patch/override locally (lockfile override or vendored patch) with a tracked upstream issue vs. work around it in our own code.

For each option: what changes, blast radius, risk, rough effort. Ask which they want — don't default to whichever's fastest without their input; that's the decision this skill exists to surface.

## Step 5: Implement the chosen option

- The Step 1 checkpoint test is the acceptance criterion — it's still failing at this point, that's expected.
- Commit only the chosen option, nothing broader, on top of the `eddeee888:oss:issue-verify` commit — never interactively rewrite, squash, or drop that commit, it's the proof this fix answers to. (Step 7's `pr:pr-sync` rebase still replays its SHA but leaves its content and trailer untouched — that's not the kind of rewrite this rule is about.)
- Commit message ends with the marker, same trailer convention as `issue-verify`:

  ```
  fix: <short description> (#<issue number>)

  eddeee888:oss:issue-fix
  ```
- Run the affected package's test suite (at minimum) to confirm the previously-failing test now passes for the right reason, and nothing else regressed.

## Step 6: Push — open a new PR only when Step 1 branched off (or `--new-pr` was passed)

Push the Step 1 branch. Check first whether it already has an open PR:

```bash
gh pr view --json number 2>&1
```

- **Continuing the checkpoint's PR** (Step 1's default case — same branch, `--new-pr` not passed) → just `git push`. Never run `gh pr create` here — it either errors on a branch that already has an open PR, or opens a second PR for what should stay one. Step 7's `pr:pr-sync` brings its title/description in line with the fix now on top.
- **A separate fix PR** (Step 1's `--new-pr` case, or a checkpoint on a different branch — a fresh `fix/<issue-number>` branch) → push and open one as a draft. In a monorepo, apply this marketplace's shared `[package-name]` title-prefix convention (see `CONVENTIONS.md` at the repo root), prefixed with the package Step 3's root-cause tracing pointed at, not whichever package the issue was filed under — e.g. `[package-name] fix: <short description of the fix> (#<issue number>)`.

  ```bash
  gh pr create --draft --title "fix: <short description of the fix> (#<issue number>)" --body "<body>"
  ```

Reference the issue with a non-closing keyword, per this marketplace's shared convention (see `CONVENTIONS.md`) — never `Fixes #123`/`Closes #123`, even though this PR resolves it; the issue shouldn't auto-close on merge. State which option was chosen and why in a sentence or two — the options were already discussed with the user, no need to re-litigate them.

## Step 7: Sync

Run `pr:pr-sync` right after opening the PR, and again after any subsequent push (review feedback, follow-up commits) — the fix PR's description should never fall behind its branch.

## When to stop instead of proceeding

- No `eddeee888:oss:issue-verify` commit found anywhere → stop at Step 1, say so, ask the user where it lives rather than guessing a base to build on.
- Root cause still unclear after Step 2/3 → don't guess an option set; go back to the issue/reporter (or `issue-verify`) for more signal before presenting choices.
- User hasn't picked an option yet → don't implement a "likely" default; wait for their answer.
