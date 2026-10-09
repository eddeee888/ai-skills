---
name: pr-note
description: 'Leave reasoning as inline comments on the user’s own open PR before others comment. `Note:` explains unspecified choices; `Drive-by:` explains retained out-of-scope changes. Skips reasoning already in the PR or commits, posts one `COMMENT` review immediately, then lists comments. Use for “leave notes on my PR,” “explain choices in this PR,” “annotate my PR,” or when finishing an implementation PR.'
---

# Leave author notes on a first implementation

Pick and keep one route exactly as `CONVENTIONS-github.md` → "GitHub access" says.

## 1. Gate

```bash
gh pr view [<number-or-url>] --json number,url,title,body,author,headRefOid,state,files,closingIssuesReferences 2>&1
gh api user --jq .login
```

Use the named PR, else the current branch's. Stop when:

- no PR exists, or it is closed or merged;
- `author.login` differs from the authenticated login—suggest `/cops:pr-review` (`/pr-review` on Cursor);
- any review thread contains a comment by someone else—review has started.

Fetch all review comments per `CONVENTIONS-github.md` → "GitHub access". Keep the full `headRefOid`, changed files, task sources, and lines covered by the user's existing `Note:`/`Drive-by:` comments. Never edit code, metadata, or threads.

## 2. Memory consent

The drafting mode applies active memory itself. Do not call `brief-task` or `scout-repo`. If the user explicitly asked to remember concrete feedback, call `learn-feedback` separately with provenance and personal or `record-team:` intent.

## 3. Draft and post

Read [draft.md](draft.md) and follow it. Drafting must run through `pr-oracle` mode `draft-author-notes`; its fallback rules preserve the same contract. If it reports `task source required`, ask what the PR is for and rerun with that answer. Do not ask for confirmation before posting author notes.

No comments → post nothing. Otherwise add the `cops:pr-note` signature without `Approved:` and post at most 10 comments as exactly one `COMMENT` review, with an empty top-level body.

## 4. Report

The user did not see the draft, so list every posted note:

```text
Notes on <owner>/<repo>#<number> — <review link> (<m> dropped as lower priority)
1. <path>:<line>  Note: <body>
2. <path>:<start>-<end>  Drive-by: <body>
```

Report `dropped`, rejected/not-posted anchors, `unverified`, and every `remove-instead` entry as an unexplained drive-by the user may want to remove. A pending-review failure is reported and left untouched. End with `CONVENTIONS-orchestration.md` → "Handoffs in the final report", labels `draft-author-notes` and `learn-feedback` when run.
