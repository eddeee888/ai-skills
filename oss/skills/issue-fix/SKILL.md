---
name: issue-fix
description: Turn an `issue-verify` checkpoint commit into an actual fix. Locates the failing test behind the `eddeee888:oss:issue-verify` marker (same branch or a different one), root-causes it, works out whether the bug lives in this library or in a dependency, presents the user 2-3 concrete fix options with pros/cons, then implements whichever they pick — building directly on top of the checkpoint commit — committing it with the `eddeee888:oss:issue-fix` marker as the last commit-message line, and pushing it as a draft PR. Use when asked to "fix issue #123", "implement the fix for #123", or right after an `issue-verify` checkpoint commit exists. This skill does not write the reproduction itself, `issue-verify` does, and does not require that checkpoint's PR to be merged — only for the commit to exist. Every push in this skill re-syncs via the `pr:sync` skill.
---

# Fix a verified issue

This is the second half of the TDD loop `issue-verify` started: a failing test already exists somewhere, committed with an `eddeee888:oss:issue-verify` marker, proving the bug is real. This skill's job is to make that test pass for real, honestly, and to make the fix decision *with* the user instead of for them — a bug rooted in a dependency wants a different response than one rooted in this repo's own code, and the user should choose which trade-off to take before code gets written.

**Every push this skill makes ends by running the `pr:sync` skill** — the fix PR's description should always match what's actually on its branch, including through mid-review pushes based on feedback.

## Step 1: Find the `issue-verify` checkpoint commit

The failing test could be on the branch you're already on (continuing the same PR `issue-verify` opened) or on a completely different one — don't assume either way, look:

```bash
git fetch origin --quiet
git log --all --oneline --grep="eddeee888:oss:issue-verify"
```

If nothing turns up, stop and ask the user where the failing test lives — a different fork/remote, or `issue-verify` genuinely hasn't run yet. Don't guess a starting point or write the fix against a test that doesn't exist yet; that throws away the entire point of doing this as two skills.

If more than one commit matches (multiple issues verified over time), disambiguate using the issue number in the commit message before proceeding.

This commit is your base for everything that follows:

- If it's already in the current branch's history, keep working right here — no new branch needed.
- Otherwise, branch from it directly, not from the tip of the base branch: `git checkout -b fix/<issue-number> <verify-commit-sha>`. The checkpoint commit's PR does not need to be merged for this — building on top of the commit is enough.

## Step 2: Re-root-cause it

Pull up the failing test and the issue thread again. Run the test locally — read the actual failure (stack trace, assertion diff, error type), don't rely on memory of what the issue said the problem was; the checkpoint commit may have surfaced something more specific.

## Step 3: Is the bug ours, or a dependency's?

Trace the failure to its actual origin:

- **Ours** — the failure originates in this repo's own code path.
- **A dependency's** — the failure originates in a direct or transitive dependency. Pin down which one, which version, and the evidence (the exact function/file in the dependency's source, a matching upstream issue/changelog entry, etc.).

This determines what options even make sense in the next step — don't skip straight to "how do we fix it" without knowing which side of the boundary the bug is actually on.

## Step 4: Present 2-3 options, and ask

Draft 2-3 concrete, real approaches — not a token "do nothing" option — sized to what Step 3 found. Depending on where the root cause sits, options typically look like:

- If ours: fix it directly in our code vs. a narrower/more defensive fix vs. a larger refactor that also prevents the class of bug.
- If a dependency's: upgrade to the version that already fixes it vs. patch/override locally (e.g. a lockfile override or vendored patch) with a tracked upstream issue vs. work around it in our own code without touching the dependency.

For each option, give: what actually changes, blast radius (what else it touches), risk, and rough effort. Ask the user which they want — don't default to whichever seems fastest without their input; that's the decision this skill exists to surface, not skip.

## Step 5: Implement the chosen option

- The checkpoint test from Step 1 is the acceptance criterion for this fix — it's still failing at this point, that's expected.
- Make the change matching the option the user picked, nothing broader, as commits on top of the `eddeee888:oss:issue-verify` commit — don't interactively rewrite, squash, or drop that commit, it's the proof this fix is answering to. (Step 7's `pr:sync` run will still rebase the branch onto its base as part of its own job — that replays the commit's SHA but leaves its content and trailer untouched; it's not the kind of rewrite this rule is about.)
- Commit the fix with the marker `eddeee888:oss:issue-fix` as the last line of the commit message, same trailer convention as `issue-verify`:

  ```
  fix: <short description> (#<issue number>)

  eddeee888:oss:issue-fix
  ```
- Run the affected package's test suite (at minimum) to confirm the previously-failing test now passes for the right reason, and that nothing else regressed.

## Step 6: Push a draft PR

Push the branch from Step 1 — the one built on top of the `eddeee888:oss:issue-verify` commit, whether that was already the current branch or a new one checked out from it.

If the repo is a monorepo (multiple workspaces/packages), prefix the title with the main package this fix actually lives in — `[package-name] fix: ...` — using the package Step 3's root-cause tracing pointed at, not whichever package the issue happened to be filed under. If the fix spans more than one package, lead with the one carrying the primary change; don't try to cram all of them into the title.

```bash
gh pr create --draft --title "fix: <short description of the fix> (#<issue number>)" --body "<body>"
```

Reference the issue with a non-closing keyword (`Relates to #123` / `Refs #123`, same convention `issue-verify` uses) in the body — never `Fixes #123` or `Closes #123`, even though this PR actually resolves it; the issue shouldn't auto-close on merge. The body should state which option was chosen and why, in a sentence or two, since the options were already discussed with the user; it doesn't need to re-litigate the alternatives.

## Step 7: Sync

Run the `pr:sync` skill right after opening the PR, and again after any subsequent push (review feedback, follow-up commits) — the fix PR's description should never fall behind its branch.

## When to stop instead of proceeding

- No `eddeee888:oss:issue-verify` commit found anywhere → stop at Step 1, say so, ask the user where it lives rather than guessing a base to build on.
- Root cause still unclear after Step 2/3 → don't guess an option set; go back to the issue/reporter (or the `issue-verify` skill) for more signal before presenting choices.
- User hasn't picked an option yet → don't implement a "likely" default; wait for their answer.
