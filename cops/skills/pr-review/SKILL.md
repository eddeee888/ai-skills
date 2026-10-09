---
name: pr-review
description: 'Review a pull request and draft inline comments on changed lines, using remembered preferences. Labels comments `Question:`, `Suggestion:`, `Issue:`, or `Test:`; uses committable suggestion blocks when appropriate. Shows the draft before posting one `COMMENT` review and never approves or requests changes unless asked. Use for “review this PR,” “leave review comments,” “review <PR URL>,” or “take a pass at #123.”'
---

# Review a pull request

A good review asks what the diff can't answer, fixes what it can, and leaves the rest alone. This skill reads a PR's diff, drafts a few inline comments on the lines that matter, checks them against the user's remembered preferences, and posts them as one review once the user has seen them.

GitHub steps below are `gh` commands. Pick and keep one access route exactly as `CONVENTIONS-github.md` → "GitHub access" says.

## Comment kinds

Every comment starts with exactly one bold prefix (`CONVENTIONS-posts.md` → "Comment labels"), then follows `CONVENTIONS-posts.md` → "Comment body" and `CONVENTIONS-posts.md` → "Citing sources":

- **`Question:`** — context does not explain a changed condition, default, removed check, move, motivation, or resulting behavior. Use `why` for motivation and `what` for behavior. Never restate visible code. Ask only after Step 4 finds no answer.
- **`Suggestion:`** — name a better implementation. If the exact fix replaces only the commented lines, include a fenced `suggestion` block with original indentation and every line in the range; cross-line or cross-file fixes get prose only.
- **`Issue:`** — name the concrete failing input or case. A critical change is an issue (`CONVENTIONS-posts.md` → "Critical changes"). Include a suggestion block when the exact fix fits. If no failing case can be named, use `Question:`.
- **`Test:`** — name the untested case for a behavior change, fixed bug, or new branch; never merely say “add tests”.

Do not post praise, code restatements, formatter/linter nits, or taste unsupported by a remembered rule.

## What counts as substantial

Comment only when the author would plausibly change or explain the code:

- Prioritize behavior, correctness, public surfaces, runtime conditions, error handling, exported types/APIs, config defaults, migrations, and critical changes.
- A broken remembered rule counts; phrase it as a normal `Suggestion:` without mentioning memory or preferences.
- Use one comment per problem. For a repeated pattern, comment on the first occurrence and name the other files.
- Generated files, lockfiles, snapshots, and vendored code get no comments.
- Keep at most 10 comments: rank extras, drop the lower-priority ones, and tell the user how many were dropped.

## Step 1: Identify the PR

```bash
gh pr view [<number-or-url>] --json number,url,title,body,author,baseRefName,headRefName,headRefOid,isDraft,state 2>&1
gh api user --jq .login
```

Use the named PR, else the current branch's. No PR, closed, or merged → stop.

Keep `headRefOid`: every comment anchors to that commit. When the PR is the user's own, tell them in one line that `/cops:pr-address` treats their own comments on their own diff as instructions to carry out. GitHub doesn't let them approve their own PR, so the review is always `COMMENT` there.

## Step 2: Read the change

```bash
gh pr diff <number>
gh pr view <number> --json commits --jq '.commits[].messageHeadline'
```

On MCP, use `pull_request_read` methods `get_diff`, then `get_commits`. Read the whole diff, PR body, and commit messages before drafting. Track candidate paths and new-side line numbers; only diff-hunk lines can hold inline comments.

Fetch all existing review threads per `CONVENTIONS-github.md` → "GitHub access". Never repeat a point already raised, resolved or not. Treat the author's `Note:` and `Drive-by:` comments as context (`CONVENTIONS-posts.md` → "Author notes").

## Step 3: Consult the oracle

Call `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor once in `scout-repo` + `sweep-diff` mode (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Pass owner/repo, whether locally checked out, `PR #<number>` as the diff, and `login: <login>`. Add `record-team: <one line>` only when explicitly requested. Its profile and remembered-rule flags are context, not automatic comments; each flag must pass the substantial threshold.

## Step 4: Check the context behind each `Question:`

Drop questions answered by the diff, body, commits, or author notes. If the answer reveals a problem, convert it to `Suggestion:` or `Issue:`; critical changes remain issues. If any question needs callers, definitions, `git log`, or `git blame`, read [context.md](context.md) now and run its single Explore context check. Do not open those outside-diff files in this chat. No outside-code candidate means do not read or run it.

## Step 5: Draft the review and show it to the user

Draft path, line or range, kind, and body for each comment, with suggestion blocks where valid. Suggested fixes must also follow applicable remembered rules.

Leave the top-level body empty unless a whole-PR issue has no changed line, such as a missing changeset; then follow `CONVENTIONS-posts.md` → "Comment labels", `CONVENTIONS-posts.md` → "Comment body", and `CONVENTIONS-posts.md` → "Citing sources".

Show the draft before any write:

```text
Review for <owner>/<repo>#<number> — <n> comments (<m> dropped as lower priority)
1. <path>:<line>  Question: <body>
2. <path>:<start>-<end>  Suggestion: <body>  [+ suggestion block]
...
Post as COMMENT? (drop/edit by number, or "post")
```

Apply edits and drops. Unless the user explicitly asks to approve or request changes, the event is always `COMMENT`. Never post without confirmation.

## Step 6: Post it as one review

After confirmation, read [post-review.md](post-review.md) now. It owns the exact `gh` JSON and MCP pending-review sequence, `headRefOid` anchoring, `COMMENT` default, and recovery. Post all comments as one review. Sign every inline comment and any non-empty top-level body with `cops:pr-review` plus `Approved: <login>` (`CONVENTIONS-posts.md` → "Skill signature"); signatures are added only after the shown draft.

## Step 7: Wrap up

Report the review link, counts by kind, and lower-priority drop count; do not repeat comments. End with `CONVENTIONS-orchestration.md` → "Handoffs in the final report", labels `scout-repo + sweep-diff` and `context check` when applicable.

## When to stop instead of proceeding

- No PR, closed, or merged → stop.
- Draft not confirmed → never post.
- Nothing substantial → post neither an empty review nor “LGTM”.
- Never approve, request changes, resolve a thread, or reply on someone else's thread unless explicitly asked.
