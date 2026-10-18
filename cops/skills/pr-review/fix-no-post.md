# pr-review: Fix, no post

Read this only after the user chose `Fix, no post` in Step 3, on their own PR. Nothing is posted to GitHub: no review, comment, or reply.

## Questions first

Before the handoff, put each approved `Question:` finding to the user in chat (`CONVENTIONS-posts.md` → "Approving drafts: one question per item"). The sidekick never answers a question itself: an answer that calls for a change goes on that finding's line as `answer:`; one that calls for none drops the finding. An `Issue:` finding needs no second prompt: the Step 3 approval is the ask, and it is fixed test first.

## Fix loop

Pass the approved items, after edits and drops, to `pr-sidekick` in one handoff (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"). Model: `standard` tier; `deep` when an item spans packages or needs design judgment. Note the commit before the loop (`git rev-parse HEAD`) for the sweep. The PR's head branch must be checked out; otherwise stop and say so.

```text
Repo <owner>/<repo>, PR #<number>, branch <headRefName> (checked out).
login: <login>
Findings to fix:
1. <path>:<line> — <label>: <body exactly as approved> [+ suggestion block] [— answer: <the user's answer to a Question:>]
2. ...
Rules that apply: none
Tests: find out
GitHub: <"gh" | "MCP — use the GitHub MCP tools in your tool list instead of gh; load each with ToolSearch first if needed">
Resuming: <"no" | the question you returned last time, and the user's answer>

For each finding in order: fix it (apply a suggestion block literally;
fix a Question: from the answer on its line, and skip one without an
answer), run the affected tests with a quiet reporter, and commit it on
its own once they pass — at most 3 attempts.
An Issue: is fixed test first: write the failing case, run it, and
confirm it fails for the finding's reason before changing other code. It
passes, or fails for another reason → skip the finding and say why.
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

Call `pr-oracle` in `sweep-diff` mode over the new commits, from the commit before the loop through `HEAD`, with the selected `GitHub route:` and `memory-root:` / `memory-login:`, on its tier's model (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent").

- `clean` → `git push`.
- In-scope flags → one follow-up sidekick handoff with only those flags and the commit SHAs; it commits and does not push. Sweep the round once more: `clean` → push; any flag → stop and bring it to the user.
- A flag outside the findings → bring it to the user; don't widen the PR.

Sweep and push once per round (`CONVENTIONS-orchestration.md` → "Fix rounds"). No commits → push nothing.

## Report

Report each finding as fixed (sha) or skipped (why), the push, and the test result. Skipped findings stay with the user; never post them. Then suggest per `CONVENTIONS-orchestration.md` → "Suggesting next steps". Handoffs: `review-pr`, `fix loop` (a second for a sweep follow-up), `sweep-diff` (a second for the follow-up), and `learn-feedback` when run.
