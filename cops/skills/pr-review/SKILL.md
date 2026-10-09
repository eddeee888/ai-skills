---
name: pr-review
description: 'Draft labeled PR comments, show them, and post one confirmed `COMMENT` review. Use for “review this PR,” “leave review comments,” or “review <PR URL>.”'
---

# Review a pull request

Keep one route per `CONVENTIONS-github.md` → "GitHub access".

## 1. Gate

```bash
gh pr view [<number-or-url>] --json number,url,title,body,author,baseRefName,headRefName,headRefOid,isDraft,state,files 2>&1
gh api user --jq .login
```

MCP obtains equivalent `files` through the shared route contract.

Use the named PR or the current branch's. Missing/closed/merged → stop. Keep `headRefOid` (full SHA). On the user's PR, mention `/cops:pr-address` and impossible self-approval.

## 2. Review

Call `pr-oracle` once in `review-pr` mode (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent") with owner/repo, number, URL, saved SHA, login, selected route, checkout path/status, title/body, and changed files. Do not call `brief-task` or `sweep-diff`.

Oracle unavailable but subagents exist → give `../../agents/pr-oracle.md`, its `review-pr` mode and review-evidence references, and the prompt to a general read-only subagent. No subagent capability → run the same contract inline. Mark Handoffs. Use separate `learn-feedback` only for explicit concrete feedback with provenance and personal or `record-team:` intent.

Never post `unverified`; valid verified comments may continue. Reject non-new-side anchors and comments beyond 10. Accept `review_body` only for a verified whole-PR finding inherently lacking an anchor (for example, a missing changeset), never for an invalid inline anchor. No comments/body → post nothing.

## 3. Confirm

Before writing, show:

```text
Review for <owner>/<repo>#<number> — <n> comments (<m> dropped as lower priority)
Body: <kind>: <body, or "empty">
1. <path>:<line>  Question: <body>
2. <path>:<start>-<end>  Suggestion: <body>  [+ suggestion block]
...
Post as COMMENT? (drop/edit by number, or "post")
```

Apply edits/drops. Unless explicitly asked otherwise, the event is always `COMMENT`. Never post without confirmation.

## 4. Post and report

After confirmation, sign each comment and non-empty `review_body` with `cops:pr-review` and `Approved: <login>` (`CONVENTIONS-posts.md` → "Skill signature"), then follow [post-review.md](post-review.md), passing the signed `review_body` as the one review's top-level body. Never approve, request changes, resolve, or reply on another's thread unless asked.

Report link, kind counts, `dropped`, and `unverified`; don't repeat comments. End with Handoffs (`CONVENTIONS-orchestration.md`), labels `review-pr` and optional `learn-feedback`.
