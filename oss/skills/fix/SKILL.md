---
name: fix
description: Turn a merged verify base-test PR into an actual fix. Root-causes the failing (skipped) test, works out whether the bug lives in this library or in a dependency, presents the user 2-3 concrete fix options with pros/cons, then implements whichever they pick and pushes it as a draft PR. Use when asked to "fix issue #123", "implement the fix for #123", or right after a verify base-test PR has merged. Requires that PR — and its skipped test — to already be on the base branch; this skill does not write the reproduction itself, `verify` does. Every push in this skill re-syncs via the `pr:pr-sync-changes` skill.
---

# Fix a verified issue

This is the second half of the TDD loop `verify` started: a skipped, failing test already sits on the base branch proving the bug is real. This skill's job is to make that test pass for real, honestly, and to make the fix decision *with* the user instead of for them — a bug rooted in a dependency wants a different response than one rooted in this repo's own code, and the user should choose which trade-off to take before code gets written.

**Every push this skill makes ends by running the `pr:pr-sync-changes` skill** — the fix PR's description should always match what's actually on its branch, including through mid-review pushes based on feedback.

## Step 1: Confirm the base test actually merged

```bash
gh pr list --search "<issue number>" --state merged --json number,title,url,mergedAt
git log origin/<base-branch> --oneline --grep="<issue number>"
```

If the base-test PR isn't merged yet, stop and say so. Don't fix ahead of the red test landing — that's the entire point of doing this as two skills instead of one, and fixing first throws away the proof the test exists to provide.

## Step 2: Re-root-cause it

Pull up the skipped test and the issue thread again. Temporarily unskip the test locally and run it — read the actual failure (stack trace, assertion diff, error type), don't rely on memory of what the issue said the problem was; the base test may have surfaced something more specific.

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

- Unskip the base test — it's the acceptance criterion for this fix.
- Make the change matching the option the user picked, nothing broader.
- Run the affected package's test suite (at minimum) to confirm the previously-skipped test now passes for the right reason, and that nothing else regressed.

## Step 6: Push a draft PR

Branch fresh off the latest base branch (the base-test branch is already merged — don't build on top of it).

```bash
gh pr create --draft --title "fix: <short description of the fix> (#<issue number>)" --body "<body>"
```

Reference the issue with a closing keyword this time (`Fixes #123`) — this PR actually resolves it. The body should state which option was chosen and why, in a sentence or two, since the options were already discussed with the user; it doesn't need to re-litigate the alternatives.

## Step 7: Sync

Run the `pr:pr-sync-changes` skill right after opening the PR, and again after any subsequent push (review feedback, follow-up commits) — the fix PR's description should never fall behind its branch.

## When to stop instead of proceeding

- Base-test PR not merged yet → stop at Step 1, say so, don't fix ahead of it.
- Root cause still unclear after Step 2/3 → don't guess an option set; go back to the issue/reporter (or the `verify` skill) for more signal before presenting choices.
- User hasn't picked an option yet → don't implement a "likely" default; wait for their answer.
