---
name: pr-review
description: Review a pull request and leave inline comments on its changed lines, shaped by the user's remembered review preferences. Each comment opens with its kind — `Question:` when a change's reason or resulting behavior isn't clear from the diff, the PR, or the code around it (`why` for motivation, `what` for what it now does); `Suggestion:` for a better approach, with a committable ```suggestion``` block where the fix fits the commented lines; `Issue:` for a concrete bug or other critical change; `Test:` for a behavior change no test covers. Comments only on substantial lines, and shows the drafted review to the user before posting it as a single `COMMENT` review. Never approves or requests changes unless asked. Use when asked to "review this PR", "leave review comments", "review <PR URL>", or "take a pass at #123".
---

# Review a pull request

A good review asks what the diff can't answer, fixes what it can, and leaves the rest alone. This skill reads a PR's diff, drafts a few inline comments on the lines that matter, checks them against the user's remembered preferences, and posts them as one review once the user has seen them.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Comment kinds

Every comment starts with exactly one of these prefixes, in bold (`**Question:**`, `CONVENTIONS.md` → "Comment labels"), then one or two sentences. The prefix tells the author what's expected: an answer, a decision, or a fix.

- **`Question:`** — something about a change isn't clear from context: a runtime condition rewritten, a default changed, a check removed, code moved for no visible reason. The prefix only marks that an answer is expected. Open with `why` when the gap is motivation (`Question: why did this runtime check change?`), or `what` when the gap is the resulting behavior or condition (`Question: what does this guard cover now?`). `what` is only for a gap the diff doesn't answer — a restatement of what the code already shows isn't a comment. Ask only after Step 4 finds no answer in the PR description, the commit messages, the author's notes, or the surrounding code.
- **`Suggestion:`** — there's a better way to write it, and you can say what: `Suggestion: use an IIFE to keep these in scope`. When the fix replaces only the commented lines, add a ```suggestion``` block with the exact replacement so the author can commit it from the PR page. Keep the original indentation and cover every line in the comment's range — the block replaces all of them. A fix spanning other lines or files gets a plain description, no block.
- **`Issue:`** — a concrete bug you can name the failing case for: `Issue: \`items[0]\` throws when the list is empty`. A critical change is the same kind of bug (`CONVENTIONS.md` → "Critical changes"). Add a ```suggestion``` block when the fix fits the commented lines. Can't name the input that breaks it → it's a `Question:`, not an `Issue:`.
- **`Test:`** — a behavior change, fixed bug, or new branch no test in the PR exercises: `Test: add a case for an empty list, since that's the branch this fixes`. Name the case, not just "add tests".

A comment that fits none of these isn't worth posting: praise, a restatement of what the code does, a nit a linter or formatter would catch, or a matter of taste with no remembered rule behind it.

## What counts as substantial

Comment on a line only when the author would plausibly change the code, or explain the change, because of it:

- Behavior, correctness, and public surface come first: runtime conditions, error handling, exported types and APIs, config defaults, migrations. A critical change counts (`CONVENTIONS.md` → "Critical changes").
- A remembered rule the diff breaks counts (Step 3). Raise it as a normal `Suggestion:`, in your own words, without citing "memory" or the user's preferences to the author.
- One comment per problem. A pattern repeated across the diff gets one comment on its first occurrence saying it recurs (`same in b.ts and c.ts`), not a copy on each line.
- Generated files, lockfiles, snapshots, and vendored code get no comments.
- Aim for the handful that matter. More than about 10 in the draft → rank them and keep the top ones. Tell the user how many you dropped, so they can ask for them back.

## Step 1: Identify the PR

```bash
gh pr view [<number-or-url>] --json number,url,title,body,author,baseRefName,headRefName,headRefOid,isDraft,state 2>&1
gh api user --jq .login
```

Use the PR the user named, else the current branch's PR. No PR found, or it's closed or merged → stop and say so.

Keep `headRefOid`: every comment anchors to that commit. When the PR is the user's own, tell them in one line that `/cops:pr-address` treats their own comments on their own diff as instructions to carry out. GitHub doesn't let them approve their own PR, so the review is always `COMMENT` there.

## Step 2: Read the change

```bash
gh pr diff <number>
gh pr view <number> --json commits --jq '.commits[].messageHeadline'
```

On the MCP route, use `pull_request_read` method `get_diff`, then method `get_commits`.

Read the whole diff, the PR body, and the commit messages before drafting anything — the last two answer many would-be `Question:` questions. Note each changed line you might comment on, with its path and its line number on the new side of the diff. Only lines inside a diff hunk can hold an inline comment.

Also fetch the existing review threads (the review-threads row in `CONVENTIONS.md` → "GitHub access"). A point someone already raised, resolved or not, is not yours to raise again. The author's `Note:` and `Drive-by:` comments explain their lines (`CONVENTIONS.md` → "Author notes"): read them as part of the PR's context, like the body.

## Step 3: Consult the oracle

Make one call to `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `scout-repo` + `sweep-diff` mode (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"). Pass the owner/repo, whether it's checked out locally, `PR #<number>` as the diff to check, and `login: <login>`. Also pass `record-team: <one line>`, but only when the user explicitly asked to remember something for the team. It returns the repo's profile (where tests live, contribution rules) plus each place the diff breaks a remembered rule. Each flag is a candidate `Suggestion:` that still has to pass "What counts as substantial".

## Step 4: Check the context behind each `Question:`

Before drafting, sort every candidate `Question:` by where its answer could be:

- **Already answered by the diff, the PR body, the commit messages, or an author's `Note:` / `Drive-by:` on those lines** → drop it. If the answer shows a real problem, it becomes a `Suggestion:` or `Issue:`. A critical change stays an `Issue:` (`CONVENTIONS.md` → "Critical changes").
- **Needs code outside the diff** (a caller, a definition, or `git log`/`git blame` of the changed lines) → hand all such questions to one `Explore` subagent (`CONVENTIONS.md` → "Hand long loops to a subagent", with model `sonnet`). Don't open those files here. The prompt:

  ```text
  Repo <owner>/<repo>, PR #<number>, head <headRefOid>.
  Checked out: <yes — path | no — read files with get_file_contents at ref <headRefOid>>
  For each question, find out whether the code outside the diff already
  answers it (a definition, a caller, the history of the changed lines).
  1. <path>:<line> — <the question>
  2. ...
  Return one line per question: answered (the answer, with the file:line
  that shows it) | unanswered | problem (what's wrong, file:line).
  Don't comment on the PR.
  ```

  `answered` → drop. `unanswered` → stays a `Question:`. `problem` → a `Suggestion:` or `Issue:`.

No candidate needs outside code → skip the subagent.

## Step 5: Draft the review and show it to the user

Draft every comment in the "Comment kinds" format: path, line (or start and end line for a range), kind, and body, with the ```suggestion``` block where a `Suggestion:` or `Issue:` fix fits the lines. Follow the user's remembered rules in the fixes too: a suggested fix that adds a module-level helper when memory says to inline it is a comment the user would reject.

Leave the review's top-level body empty unless something applies to the whole PR and has no line to sit on (e.g. "the changeset is missing"); then it's one or two sentences with the same kind prefix.

Show the draft to the user before posting anything — it posts under their name on someone's PR:

```text
Review for <owner>/<repo>#<number> — <n> comments (<m> dropped as lower priority)
1. <path>:<line>  Question: <body>
2. <path>:<start>-<end>  Suggestion: <body>  [+ suggestion block]
...
Post as COMMENT? (drop/edit by number, or "post")
```

Apply the user's edits and drops. The user wants approve or request changes → use that event. Otherwise always `COMMENT`.

## Step 6: Post it as one review

Post every comment in a single review, so the author gets one notification instead of one per line.

On the `gh` route, write the payload to a file with the file-writing tool (`CONVENTIONS.md` → "Passing drafted text to `gh`"). Then:

```bash
d="$(git rev-parse --git-dir 2>/dev/null || mktemp -d)"
# $d/pr-review.json:
# {"commit_id": "<headRefOid>", "event": "COMMENT", "body": "<top-level body or empty>",
#  "comments": [{"path": "<path>", "line": <line>, "side": "RIGHT", "body": "<body>"},
#               {"path": "<path>", "start_line": <start>, "start_side": "RIGHT",
#                "line": <end>, "side": "RIGHT", "body": "<body>"}]}
gh api repos/<owner>/<repo>/pulls/<number>/reviews --input "$d/pr-review.json"
rm "$d/pr-review.json"
```

On the MCP route:

1. `pull_request_review_write` method `create` with `commitID: <headRefOid>` and no `event` — creates a pending review.
2. `add_comment_to_pending_review` once per comment, with `subjectType: LINE`, `side: RIGHT`, and `line`. For a range, also pass `startLine` and `startSide: RIGHT`.
3. `pull_request_review_write` method `submit_pending` with `event: COMMENT` and the top-level `body`.

GitHub rejects a comment because its line isn't in the diff → move it to the nearest changed line it's about, or fold it into the top-level body. Never drop it silently. A failure partway through the MCP route leaves a pending review only the user can see → tell them; delete it with `delete_pending` only if they say to.

## Step 7: Wrap up

Report briefly: the review link, how many comments of each kind, and how many were dropped as lower priority. Don't paste the comments back. End with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with labels `scout-repo + sweep-diff` and `context check`.

## When to stop instead of proceeding

- No PR found, or it's closed or merged → stop, say so.
- The user hasn't confirmed the draft → never post.
- Nothing substantial found → say so and post nothing. An empty review or "LGTM" comment isn't this skill's call.
- Never approve, request changes, resolve a thread, or reply on someone else's thread unless the user asks.
