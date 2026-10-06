---
name: pr-note
description: Leave the author's reasoning on their own PR's first implementation, as inline comments on its changed lines. `Note:` explains a choice the task didn't specify — especially one that follows the user's remembered preferences; `Drive-by:` explains a change the task doesn't need, which stays in the PR. Skips anything the PR body or commit messages already explain, and posts the comments straight away as a single `COMMENT` review — no draft to confirm, since they're the user's own reasoning on their own PR — then lists what it posted. Only on the user's own open PR, before anyone else has commented on its lines. Use when asked to "leave notes on my PR", "explain the choices in this PR", "annotate my PR", or when finishing an implementation PR.
---

# Leave author notes on a first implementation

A reviewer reading a fresh PR sees what changed, not why the author picked one way over another, or why a line unrelated to the task is in there. This skill leaves that reasoning on the lines themselves, once, before the first review — so the review spends its questions on what's actually unclear.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Comment kinds

Every comment starts with exactly one of these prefixes, in bold (`**Note:**`, `CONVENTIONS.md` → "Comment labels"), then one or two sentences on why. No ```suggestion``` blocks — these explain the code as it is. What `cops:pr-address` and `cops:pr-review` do with them is in `CONVENTIONS.md` → "Author notes".

- **`Note:`** — a choice the task didn't specify: one approach over another, where a helper lives, a default picked, an edge case handled a particular way. Give the reason in plain words: `Note: inlined the parser, since this is its only caller`. A choice that follows a remembered preference still gets its reason, not "per my preferences" — never cite memory or the oracle.
- **`Drive-by:`** — a change the task doesn't need: a fix, rename, or cleanup made in passing. Leave the code in and say why it's here: `Drive-by: this guard threw on an empty list, which the new caller hits`. A drive-by with no reason worth stating is one to take out, not explain — don't comment on it; name it in the wrap-up instead.

## What gets a comment

- **The task** is what the linked issue, the PR body, and the commit messages say the PR is for. None of them says → ask the user what the PR is for before drafting; never treat the whole diff as drive-bys.
- **Only what's unexplained.** Skip a choice the PR body, a commit message, or a code comment already explains, and a choice so standard no reviewer would ask.
- **Every drive-by gets one anyway.** A drive-by is easy to miss, and a reviewer may not read the PR body, so a `Drive-by:` goes on its lines even when the body or a commit message already explains it.
- **One comment per decision.** The same choice repeated across the diff gets one comment on its first occurrence saying where else it applies (`same in b.ts and c.ts`).
- Generated files, lockfiles, snapshots, and vendored code get no comments.
- About 10 at most. More → rank by what a reviewer is likeliest to ask about, keep the top ones, and tell the user how many you dropped.

## Step 1: Check it's a first implementation of the user's PR

```bash
gh pr view [<number-or-url>] --json number,url,title,body,author,baseRefName,headRefName,headRefOid,state,closingIssuesReferences 2>&1
gh api user --jq .login
```

Use the PR the user named, else the current branch's PR. Stop (see "When to stop") when:

- there's no PR, or it's closed or merged;
- its `author.login` isn't the user's login — the reasoning is the author's to give;
- its review threads (the review-threads row in `CONVENTIONS.md` → "GitHub access") hold a comment from anyone but the user — review has started, and `/cops:pr-address` (`/pr-address` on Cursor) owns the threads from here.

Keep `headRefOid`: every comment anchors to that commit. The user's own `Note:` or `Drive-by:` comments already on the PR (bold or not — `CONVENTIONS.md` → "Comment labels") → this is a re-run; draft only for lines none of them covers.

## Step 2: Read the change

```bash
gh pr diff <number>
gh pr view <number> --json commits --jq '.commits[] | .messageHeadline + "\n" + .messageBody'
```

On the MCP route, use `pull_request_read` method `get_diff`, then method `get_commits`. Read the linked issue too (`closingIssuesReferences`, or a reference in the body or commits) with `gh issue view <n>` (MCP: `issue_read` method `get`) — it's the clearest statement of the task.

Read the whole diff, the PR body, the commit messages, and the issue before drafting. Note each candidate line with its path and its line number on the new side of the diff — only lines inside a diff hunk can hold an inline comment — and whether it's a choice inside the task or a change outside it.

## Step 3: Consult the oracle

Make one call to `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `scout-repo` + `brief-task` mode (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"). Pass the owner/repo, whether it's checked out locally, `login: <login>`, and for `brief-task` the changed files plus the task in one line. Also pass `record-team: <one line>`, but only when the user explicitly asked to remember something for the team.

The brief lists the remembered rules that apply to this change. A changed line that follows one is a candidate `Note:` — the rule tells you the choice was deliberate, and its wording gives you the reason to state, in your own words.

## Step 4: Draft the notes

Draft every comment in the "Comment kinds" format: path, line (or start and end line for a range), kind, and body. Leave the review's top-level body empty. Don't show the draft or wait for a go-ahead — post it in Step 5. These explain the user's own choices on the user's own PR, and asking first makes them read like a review rather than the author talking.

## Step 5: Post it as one review

Sign every comment with `cops:pr-note`, without the `✓ <login>` approval — the user didn't see the draft (`CONVENTIONS.md` → "Skill signature"). Post every comment in a single `COMMENT` review on `headRefOid`, exactly as `cops:pr-review` Step 6 does: on the `gh` route, the payload goes in `$(git rev-parse --git-dir)/pr-note.json` (`CONVENTIONS.md` → "Passing drafted text to `gh`") and is sent with `gh api repos/<owner>/<repo>/pulls/<number>/reviews --input`, then removed; on the MCP route, a pending review, one `add_comment_to_pending_review` per comment, then `submit_pending` with `event: COMMENT`.

GitHub rejects a comment because its line isn't in the diff → move it to the nearest changed line in the same hunk. No such line → tell the user; never drop it silently. A failure partway through the MCP route leaves a pending review only the user can see → tell them; delete it with `delete_pending` only if they say to.

## Step 6: Wrap up

The user didn't see the draft, so list what went up, one line per comment, so they can edit or delete any on GitHub:

```text
Notes on <owner>/<repo>#<number> — <review link> (<m> dropped as lower priority)
1. <path>:<line>  Note: <body>
2. <path>:<start>-<end>  Drive-by: <body>
```

Then name any drive-by with no reason worth stating, as a change the user may want to take out. End with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with label `scout-repo + brief-task`.

## When to stop instead of proceeding

- No PR, or it's closed or merged → stop, say so.
- Not the user's PR → stop; suggest `/cops:pr-review` (`/pr-review` on Cursor) if they want to comment on it.
- Someone other than the user has commented on its lines → stop; review has started.
- Nothing states what the PR is for, and the user hasn't said → ask, don't guess.
- Nothing unexplained → say so and post nothing.
- Never edit code, the PR's title or body, or a thread — this skill only adds the one review.
