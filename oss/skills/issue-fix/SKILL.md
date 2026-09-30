---
name: issue-fix
description: Turn an `issue-verify` checkpoint commit into a fix. Locates the failing test behind the `eddeee888:oss:issue-verify` marker (same branch or another), root-causes it, works out whether the bug lives in this library or a dependency, presents the user 2-3 concrete fix options with pros/cons, then implements the one they pick — built directly on the checkpoint commit — commits it with the `eddeee888:oss:issue-fix` marker as the last commit-message line, and pushes. By default builds on the checkpoint's own branch and PR, checking that branch out if needed; pass `--new-pr` to open a separate fix PR instead. Use when asked to "fix issue #123", "implement the fix for #123", or right after an `issue-verify` checkpoint commit exists. This skill does not write the reproduction (`issue-verify` does), and does not require the checkpoint's PR to be merged — only for the commit to exist. It never runs `pr:pr-sync` itself; it suggests it after pushing when the `pr` plugin is installed.
---

# Fix a verified issue

Second half of the TDD loop `issue-verify` started: a failing test, committed with an `eddeee888:oss:issue-verify` marker, proves the bug is real. This skill makes that test pass, and makes the fix decision *with* the user — a bug rooted in a dependency wants a different response than one in this repo's code, and the user should choose the trade-off before code gets written.

**This skill never runs `pr:pr-sync` itself.** When a push leaves a PR's description behind its branch, suggest it instead (`CONVENTIONS.md` → "Suggesting `pr-sync` after a push", Step 7).

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Find the `issue-verify` checkpoint commit

The failing test may be on the current branch or a different one — look, don't assume. Cheap, exact checks first — the current branch's history, and a checkpoint branch by its conventional name:

```bash
git log --oneline --grep="eddeee888:oss:issue-verify" HEAD | grep -E "#<issue-number>([^0-9]|$)"
git ls-remote --heads origin "repro/<issue-number>"
```

Both empty → one wider sweep, since a checkpoint can sit on a differently named branch:

```bash
git fetch origin --quiet
git log --all --oneline --grep="eddeee888:oss:issue-verify" | grep -E "#<issue-number>([^0-9]|$)"
```

No issue number given → run the same commands without the `grep -E` filter (and skip the `ls-remote`), then ask the user which issue if more than one checkpoint turns up. The `([^0-9]|$)` keeps `#12` from matching `#123`.

Nothing found → stop, ask the user where it lives rather than guessing a starting point.

This commit is the base for everything that follows. By default, build the fix on the checkpoint's own PR — one PR going red to green is simpler for reviewers. `--new-pr` forces a separate fix PR (e.g. the checkpoint PR isn't yours to push to, or the fix warrants its own review):

- In the current branch's history, no `--new-pr` → keep working here; the checkpoint's PR becomes the fix PR.
- On another branch (e.g. `repro/<issue-number>`), no `--new-pr` → check it out (`git switch <branch>`, or `git switch -c <branch> --track origin/<branch>` if it's only on the remote) and work there; its PR becomes the fix PR. Can't push to that branch (someone else's fork or branch) → say so and fall through to the next case.
- `--new-pr` passed, or the checkpoint branch isn't one you can push to → branch from the checkpoint commit, not the base branch's tip: `git checkout -b fix/<issue-number> <verify-commit-sha>` — paired with `issue-verify`'s `repro/<issue-number>` (`CONVENTIONS.md` → "Checkpoint/fix branch naming"). The checkpoint's PR needn't be merged.

## Step 2: Re-root-cause it

First get the repo's profile (`scout-repo`) from `pr:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"): how to run one test in the affected package, where tests live, and whether Step 6's title needs a package prefix. Not available → work those out from the repo.

Then run only the failing test locally, with the runner's quiet or summary reporter so only the failure lands in context, and read the failure (stack trace, assertion diff, error type) — it may be more specific than the issue. Re-read the issue thread only when the failure doesn't match the checkpoint commit message.

## Step 3: Is the bug ours, or a dependency's?

- **Ours** — originates in this repo's own code path.
- **A dependency's** — originates in a direct or transitive dependency. Pin down which one, which version, and the evidence (the exact function/file in its source, a matching upstream issue/changelog entry).

This decides which options make sense — don't jump to "how do we fix it" before knowing which side of the boundary the bug is on.

Hand the tracing to an exploring subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), so the files it reads — including a dependency's source — stay out of this chat. Pass the failing test's path and the failure summary; ask for ours or a dependency's, the exact function/file, and the evidence (for a dependency: which one, which version, any upstream issue or changelog entry), then 2–3 fix options shaped as in Step 4 with what each changes, blast radius, risk, and rough effort — a line or two each. Present the options from its answer; don't open code here to size them.

## Step 4: Present 2-3 options, and ask

Sized to what Step 3 found:

- Ours: fix it directly vs. a narrower/more defensive fix vs. a larger refactor that also prevents the class of bug.
- Dependency's: upgrade to the version that already fixes it vs. patch/override locally (lockfile override or vendored patch) with a tracked upstream issue vs. work around it in our own code.

For each option: what changes, blast radius, risk, rough effort. Ask which they want — don't default to the fastest.

## Step 5: Implement the chosen option

Get a brief (`brief-task`) from the oracle, passing the files the chosen option touches and a one-line summary of it (Step 2's profile already covers running tests). The brief brings the reviewer-requested rules that apply to this change. When the user explicitly asked to remember something for the team, also pass `record-team: <one line>` on this call only — not on the `sweep-diff` call below, or it's recorded twice. Not available → pass "none" as the rules, and make the `sweep-diff` step below a quick read of your own diff.

Then hand the edit/test/commit loop to one subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), with this prompt:

```text
Repo <owner>/<repo>, branch <branch> (already checked out), on top of
checkpoint commit <verify-commit-sha> (marked eddeee888:oss:issue-verify).
Failing test: <path> — run it with: <command from the profile, or "find out">
Fix to make: <the chosen option, in two or three lines>
Rules that apply: <the brief's lines, or "none">

Make only this fix, nothing broader. The failing test is the acceptance
criterion. Never rewrite, squash, or drop the checkpoint commit.
Run the affected package's tests with a quiet or summary reporter, reading
only failures, until the failing test passes for the right reason and
nothing else regressed — at most 3 attempts. Still failing after the third
→ stop without committing and say what you tried and what's still failing.
Then commit, with this message ending in the marker:
  fix: <short description> (#<issue number>)

  eddeee888:oss:issue-fix
Do not push. If the fix needs more than the chosen option, stop and say why.
Return at most 5 lines: files changed, commit sha, tests run and result,
or why you stopped.
```

Then run `pr:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `sweep-diff` mode on `<verify-commit-sha>..HEAD` — the fix commits since the checkpoint. Anything flagged within the chosen option's scope → one follow-up subagent with just the flags and the sha, same prompt shape. The subagent stopped → bring its reason to the user before going further.

A later `pr:pr-sync` rebase replays the checkpoint's SHA but leaves its content and trailer untouched — not the rewrite the prompt rules out.

## Step 6: Push — open a new PR only when the branch has none

Check whether the Step 1 branch already has an open PR — this answer, not a guess from Step 1, decides what happens:

```bash
gh pr view --json number,author 2>&1
```

- **It has one** (normally the checkpoint's PR, continued in Step 1) → `git push` only. Never run `gh pr create` here — it either errors on a branch that already has an open PR, or opens a second PR for what should stay one. Its title and description still describe the checkpoint — keep its `author.login` for Step 7.
- **It has none** (the `fix/<issue-number>` branch from Step 1) → `git push -u origin <branch>` and open a draft PR. In a monorepo, apply the shared `[package-name]` prefix (`CONVENTIONS.md` → "Monorepo title prefix") with the package Step 3's tracing pointed at, not the one the issue was filed under — e.g. `[package-name] fix: <short description of the fix> (#<issue number>)`, issue reference at the end (`CONVENTIONS.md` → "Trailing issue reference"). Write the title and body to files first (`CONVENTIONS.md` → "Passing drafted text to `gh`"):

  ```bash
  gh pr create --draft --title "$(cat <title-file>)" --body-file <body-file>
  ```

Reference the issue with a non-closing keyword (`CONVENTIONS.md` → "Non-closing issue references") — never `Fixes #123`/`Closes #123`, even though this PR resolves it. State which option was chosen and why in a sentence or two — no need to re-litigate the options.

## Step 7: Suggest a sync

Don't run `pr:pr-sync`. A new `fix/<issue-number>` PR was just written from the fix, so it's current. When the push went to an existing PR (normally the checkpoint's), add the stale-description line if that PR's author is the user (`CONVENTIONS.md` → "Suggesting `pr-sync` after a push"). Either way, the report's last line is the handoff line (`CONVENTIONS.md` → "Handoff line in the final report"), with labels `scout-repo`, `root cause`, `brief-task`, `fix loop`, and `sweep-diff`.

## When to stop instead of proceeding

- No `eddeee888:oss:issue-verify` commit found anywhere → stop at Step 1, say so, ask the user where it lives rather than guessing a base.
- Root cause still unclear after Step 2/3 → don't guess an option set; go back to the issue/reporter (or `issue-verify`) for more signal first.
- User hasn't picked an option → don't implement a "likely" default; wait.
