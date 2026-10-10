---
name: pr-address
description: 'Address unresolved review threads on the user’s PR after their explicit or short-reply go-ahead; implement instructions and answer why-questions with evidence. Batch threads awaiting others, comments on someone else’s PR, and high-risk changes for user review. Never resolve threads. Use for “address PR comments,” “handle the review feedback,” “respond to reviewers,” or new PR-review activity while watching.'
---

# Address PR review comments

A reviewer's ask isn't the user's decision until the user weighs in. The user's own short reply in a thread — or their own comment on their own diff — is the go-ahead; this skill carries it out. Everything else goes to the user in one batch first.

GitHub steps below are `gh` commands. Pick and keep one access route exactly as `CONVENTIONS-github.md` → "GitHub access" says.

## Step 1: Identify the PR and whether it's the user's

```bash
gh pr view --json number,url,author,headRefName,baseRefName 2>&1
gh api user --jq .login
```

Use the current branch's PR unless the user gave a PR number/URL. No PR found → stop. Compare `author.login` with the authenticated login before any action: only the user's own PR can have automatic threads; every thread on someone else's PR goes through Step 4.

## Steps 2–3: Fetch and classify

Read [classify.md](classify.md) now. Hand Steps 2–3 to `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor in `triage-threads` + `scout-repo` mode (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Pass owner/repo/number, login, whether the PR is the user's, and the entire contents of `classify.md` verbatim as the classification rules; do not pass a summary or the GraphQL query. The oracle fetches threads through GitHub MCP and returns both buckets, remembered-rule matches, possible inactive memory candidates, and the repo profile. Keep the profile's `tests` line and each thread's remembered rules for Step 5.

If the user explicitly asked to remember concrete feedback, call `learn-feedback` separately with their intent and the feedback's provenance; team intent must be a `record-team:` line. Never fold it into the combined operational call. Show any other `memory-candidate:` lines to the user and ask whether to save them as inactive candidates; do not persist them without that consent.

Only if the oracle is unavailable, read [fetch-threads.md](fetch-threads.md) now, fetch every unresolved review thread, then apply `classify.md` inline exactly. Conversation-tab comments are out of scope.

## Step 4: Resolve the "needs the user first" bucket before applying anything

If non-empty, ask for each item per `CONVENTIONS-posts.md` → "Approving drafts: one question per item": file:line, who said what, and why an acknowledged item is high risk, with options implement, draft a reply, or leave. Without that tool, show all items together and ask the same for each. Apply no automatic action, including already automatic threads, while any decision is waiting. Fold the user's decisions into Step 5. If empty, continue.

## Step 5: Handling comments

Handle every settled thread by the original comment's nature.

### 5a. Authoritative

Read [implement.md](implement.md) now, before editing, testing, committing, pushing, or replying. Follow its exact batch prompt and mechanics. In summary: low-risk work uses sequential batches of at most 10 threads, with same-file threads together. Each batch implements/tests/commits without posting, then gets one `pr-oracle` `sweep-diff` check before the push gate. A failed final test blocks push, replies, and later batches. Push once per passing batch, then reply to each done thread; skipped threads return to the user.

An explicitly approved high-risk thread runs after low-risk batches, alone. Show its result and commit before the check/push/reply gates. Never let a high-risk item inherit a low-risk batch's approval.

### 5b. Why-question

Read [research.md](research.md) now, before researching or drafting any answer. It defines the required research handoff, public-source rules, reply shape, and posting behavior. Why-answers never receive `Approved:` because the user has not seen the answer text.

## Step 6: Wrap up

Never run `cops:pr-sync`. If implementation changes were pushed to the user's own PR, suggest `pr-sync` exactly as `CONVENTIONS-orchestration.md` → "Suggesting next steps" says. Report counts implemented/replied and still open for manual resolution. End with the `CONVENTIONS-orchestration.md` → "Handoffs in the final report" list, in execution order, using `triage-threads + scout-repo`, `learn-feedback` when run, one `5a batch` per batch, `sweep-diff` per check, and `5b research` when applicable.

## When to stop instead of proceeding

- No PR for the branch or argument → stop; this skill does not create one.
- Any item still awaits the user's Step 4 decision → do nothing.
- A why-question has only private backing → post only what public sources support, or say the backing is private and give that source only to the user (`CONVENTIONS-posts.md` → "Citing sources").
- The user has not replied in a reviewer thread → never auto-act, however trivial or authoritative it looks.
- Never resolve a review thread. Never auto-run `pr-sync`. Replying is the final thread action.
