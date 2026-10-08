---
name: pr-note
description: Leave the author's reasoning on their own PR's first implementation, as inline comments on its changed lines. `Note:` explains a choice the task didn't specify — especially one that follows the user's remembered preferences; `Drive-by:` explains a change the task doesn't need, which stays in the PR. Skips anything the PR body or commit messages already explain, and posts the comments straight away as a single `COMMENT` review — no draft to confirm, since they're the user's own reasoning on their own PR — then lists what it posted. Only on the user's own open PR, before anyone else has commented on its lines. Use when asked to "leave notes on my PR", "explain the choices in this PR", "annotate my PR", or when finishing an implementation PR.
---

# Leave author notes on a first implementation

A reviewer reading a fresh PR sees what changed, not why the author picked one way over another, or why a line unrelated to the task is in there. This skill leaves that reasoning on the lines themselves, once, before the first review — so the review spends its questions on what's actually unclear.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## How this runs

Only the short ends run here. Steps 3–5 — reading the change, drafting, and posting — live in `draft.md` next to this file and run in one subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"). The diff and one posting call per comment are most of this skill's work, and in the main chat each of those steps re-reads the whole conversation.

1. **Here:** Steps 1–2, including the oracle call.
2. **Subagent:** Steps 3–5, on `sonnet` (scoped drafting; `CONVENTIONS.md` → "Hand long loops to a subagent"), with this prompt:

   ```text
   Repo <owner>/<repo>, PR #<number>, head commit <headRefOid>, by the user
   (login: <login>).
   Follow Steps 3–5 in <this skill's directory>/draft.md.
   Task: <what the user said the PR is for, or "from the PR">
   Oracle profile and brief: <what it returned, or "none">
   Already noted: <path:line of each line the user's own Note:/Drive-by:
   comments cover, or "none">
   Resuming: <"no" | the question you returned last time, and the user's answer>
   GitHub: <"gh" | "MCP — use the MCP tool named beside each command; load
   each with ToolSearch first if needed">
   Stop and return a question instead of guessing when nothing states what
   the PR is for. Post only the one review Step 5 describes; edit nothing
   else on the PR.
   Return only: the review link, then one line per posted comment as
   `<path>:<line or start-end>  <Kind>: <body>`, then `dropped: <n>`, `not
   posted: <path:line — why, or none>`, `unexplained drive-bys: <path:line,
   or none>` — or the question, or "nothing unexplained", or `pending review
   left: <what failed>`.
   ```

   A question → ask the user, then spawn it again with `Resuming:` filled in. "Nothing unexplained" → say so and stop. `pending review left` → tell the user a pending review only they can see is on the PR, and delete it with `delete_pending` only if they say to.
3. **Here:** Step 6, on what it returns.

No way to spawn a subagent → read `draft.md` and run Steps 3–5 here.

## Step 1: Check it's a first implementation of the user's PR

```bash
gh pr view [<number-or-url>] --json number,url,title,author,headRefOid,state,files 2>&1
gh api user --jq .login
```

Use the PR the user named, else the current branch's PR. Stop (see "When to stop") when:

- there's no PR, or it's closed or merged;
- its `author.login` isn't the user's login — the reasoning is the author's to give;
- its review threads (the review-threads row in `CONVENTIONS.md` → "GitHub access") hold a comment from anyone but the user — review has started, and `/cops:pr-address` (`/pr-address` on Cursor) owns the threads from here.

Keep the changed files (`files`; MCP: `pull_request_read` method `get_files`) for Step 2, and `headRefOid` for the subagent's prompt — every comment anchors to that commit. Don't read the diff here — the subagent does. The user's own `Note:` or `Drive-by:` comments already on the PR (bold or not — `CONVENTIONS.md` → "Comment labels") → this is a re-run; pass the lines they cover as `Already noted:`.

## Step 2: Consult the oracle

Make one call to `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `scout-repo` + `brief-task` mode (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"). Pass the owner/repo, whether it's checked out locally, `login: <login>`, and for `brief-task` the changed files from Step 1 plus the PR's title as the task. Also pass `record-team: <one line>`, but only when the user explicitly asked to remember something for the team. Its output goes into the subagent's prompt.

## Step 6: Wrap up

The user didn't see the draft, so list what went up — the subagent's lines, as it returned them — so they can edit or delete any on GitHub:

```text
Notes on <owner>/<repo>#<number> — <review link> (<m> dropped as lower priority)
1. <path>:<line>  Note: <body>
2. <path>:<start>-<end>  Drive-by: <body>
```

Then name any comment it couldn't post, and any drive-by with no reason worth stating, as a change the user may want to take out. End with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with labels `scout-repo + brief-task` and `draft and post`.

## When to stop instead of proceeding

- No PR, or it's closed or merged → stop, say so.
- Not the user's PR → stop; suggest `/cops:pr-review` (`/pr-review` on Cursor) if they want to comment on it.
- Someone other than the user has commented on its lines → stop; review has started.
- Nothing states what the PR is for, and the user hasn't said → the subagent returns the question; ask, don't guess.
- Nothing unexplained → say so and post nothing.
- Never edit code, the PR's title or body, or a thread — this skill only adds the one review.
