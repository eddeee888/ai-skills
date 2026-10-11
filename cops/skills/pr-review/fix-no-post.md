# pr-review: Fix, no post

Read this only after the user chose `Fix, no post` in Step 3, on their own PR. Nothing is posted to GitHub: no review, comment, or reply.

## Fix loop

Pass the approved items, after edits and drops, to `pr-sidekick` in one handoff (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"). Model: `sonnet`; unset when an item spans packages or needs design judgment. Note the commit before the loop (`git rev-parse HEAD`) for the sweep. The PR's head branch must be checked out; otherwise stop and say so.

```text
Repo <owner>/<repo>, PR #<number>, branch <headRefName> (checked out).
login: <login>
Findings to fix:
1. <path>:<line> — <label>: <body exactly as approved> [+ suggestion block]
2. ...
Rules that apply: none
Tests: find out
GitHub: <"gh" | "MCP — use the GitHub MCP tools in your tool list instead of gh; load each with ToolSearch first if needed">
Resuming: <"no" | the question you returned last time, and the user's answer>

For each finding in order: fix it (apply a suggestion block literally;
answer a Question: by changing the code only when the answer is plainly
a defect, otherwise skip it), run the affected tests with a quiet
reporter, and commit it on its own once they pass — at most 3 attempts.
Stay inside each finding. One that needs other files' behavior, a public
API, security/auth, or config/infra → skip it and say why.
Commit in the repo's commit style, ending with:

  Skill: cops:pr-review
  Approved-by: <login>

Do not push, post, reply, or edit any PR or issue.
Return one line per finding: fixed (sha, one-line summary) | skipped
(why) — then one line for the final test run.
```

The user's Step 3 choice is the approval (`CONVENTIONS-pr-metadata.md` → "Commit trailers"). A question → ask the user, then spawn again with `Resuming:` filled in. No subagent capability → run the same steps here and mark `fix loop` as `inline (no subagent capability)`.

## Sweep and push

Call `pr-oracle` in `sweep-diff` mode over the new commits, from the commit before the loop through `HEAD`, with `memory-root:` / `memory-login:`.

- `clean` → `git push`.
- In-scope flags → one follow-up sidekick handoff with only those flags and the commit SHAs; it commits and does not push. Sweep that commit once more: `clean` → push; any flag → stop and bring it to the user.
- A flag outside the findings → bring it to the user; don't widen the PR.

No commits → push nothing.

## Report

Report each finding as fixed (sha) or skipped (why), the push, and the test result. Skipped findings stay with the user; never post them. Then suggest per `CONVENTIONS-orchestration.md` → "Suggesting next steps". Handoffs: `review-pr`, `fix loop` (a second for a sweep follow-up), `sweep-diff` (a second for the follow-up), and `learn-feedback` when run.
