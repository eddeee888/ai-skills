---
name: pr-review
description: 'Draft substantial labeled PR comments using active preferences, show them, then post one confirmed `COMMENT` review.'
---

# Review a pull request

Keep one route per `CONVENTIONS-github.md` → "GitHub access".

## 1. Gate

```bash
gh pr view [<number-or-url>] --json number,url,title,body,author,baseRefName,headRefName,headRefOid,isDraft,state,files 2>&1
gh api user --jq .login
```

MCP obtains equivalent `files` through the shared route contract.

Use the named PR, else the current branch's. Missing/closed/merged → stop. Keep `headRefOid` as saved full SHA. On the user's PR, mention `/cops:pr-address` and impossible self-approval.

## 2. Brief and review

Call `pr-oracle` once in `brief-task` mode (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent") with login, title/body, and changed files. Do not call `scout-repo`. Use separate `learn-feedback` only for explicit concrete feedback with provenance and personal or `record-team:` intent.

Call `pr-reviewer` `review-pr` with owner/repo, number, URL, saved SHA, login, route, checkout path/status, and applicable rules. It scouts context, reads complete evidence, and returns YAML.

Reviewer unavailable but subagents exist → give `../../agents/pr-reviewer.md` and the prompt to a general read-only subagent. No subagent capability → run it inline. Mark Handoffs; never substitute `sweep-diff`.

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

Report link, kind counts, `dropped`, and `unverified`; don't repeat comments. End with Handoffs (`CONVENTIONS-orchestration.md`), labels `brief-task`, optional `learn-feedback`, and `review-pr`.
