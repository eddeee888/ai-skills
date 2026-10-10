# Chosen-option fix loop

Use this file only after the user selects an option.

## Oracle order

Ask the oracle for `brief-task` first, passing the chosen option's files, a one-line summary, and `for: pr-sidekick`. Apply any `caller only:` lines yourself; keep them out of the prompt. The brief supplies reviewer-requested rules. If the user explicitly asked to remember concrete feedback, make a separate `learn-feedback` call with its provenance and personal or `record-team:` intent; never add memory instructions to `brief-task` or `sweep-diff`. If unavailable, use `none` for rules and later inspect your own diff in place of `sweep-diff`.

Then delegate one edit/test/commit loop (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"):

```text
Repo <owner>/<repo>, branch <branch> (already checked out), on top of
checkpoint commit <verify-commit-sha> (the oss:issue-verify checkpoint).
Failing test: <path> — run it with: <command from the profile, or "find out">
Fix to make: <the chosen option, in two or three lines>
Rules that apply: <the brief's lines, or "none">

Make only this fix, nothing broader. The failing test is the acceptance
criterion. Never rewrite, squash, or drop the checkpoint commit.
Run the affected package's tests with a quiet or summary reporter, reading
only failures, until the failing test passes for the right reason and
nothing else regressed — at most 3 attempts. Still failing after the third
→ stop without committing and say what you tried and what's still failing.
Then commit with this message; any trailers your host adds go after these
two, in the same paragraph:
  fix: <short description> (#<issue number>)

  Skill: oss:issue-fix
  Approved-by: <user's GitHub login>
Do not push. If the fix needs more than the chosen option, stop and say why.
Return at most 5 lines: files changed, commit sha, tests run and result,
or why you stopped.
```

The test must pass for the correct reason, and affected-package tests must show no regression. Preserve both required trailers and the checkpoint commit.

## Sweep follow-up

After a successful commit, run `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor in `sweep-diff` mode over `<verify-commit-sha>..HEAD`. For flags inside the selected option's scope, run exactly one follow-up subagent with only the flags and commit SHA, using the same constraints and output shape. Out-of-scope flags do not authorize broader work.

If the implementation or follow-up stops, return its reason before push. A later `cops:pr-sync` rebase may replay the checkpoint SHA while preserving its content and trailer; that is not the forbidden rewrite.
