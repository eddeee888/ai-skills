---
name: pr-address
description: Work through a pull request's unresolved review threads and act on the ones the user has signaled they're ready for. On the user's own PR, a thread is acted on once the user replied last with a go-ahead ("Ok", "let me check"), or when the user commented on their own diff: an instruction or suggestion gets implemented, a why-question gets a backed-up answer. Threads awaiting someone else's reply, threads on someone else's PR, and high-risk changes go to the user in one batch first. Never resolves a thread. Use when asked to "address PR comments", "handle the review feedback", "respond to reviewers", or after leaving short replies like "Ok" on review comments.
---

# Address PR review comments

A reviewer's comment isn't actionable until the user has actually weighed in on it — a "do this" from a teammate isn't the user's decision to implement until the user has said so, even with a one-word "Ok". This skill treats the user's own reply in a thread as that authorization signal, then carries out what was authorized: an authoritative instruction gets implemented, a why-question gets answered with real backing. When there's no reviewer in a thread at all — the user commenting on their own diff — that comment is already the user telling the skill what to do, with no separate reply to wait for; it's carried out the same way. Everything the user hasn't yet weighed in on — including anything flagged risky even after a go-ahead — gets surfaced to them in one batch, before any action is taken.

## Step 1: Identify the PR and whether it's the user's

```bash
gh pr view --json number,url,author,headRefName,baseRefName 2>&1
gh api user --jq .login
```

Use the current branch's PR unless the user gave a specific PR number/URL. No PR found → stop, see "When to stop" below.

Compare the PR's `author.login` to the authenticated user's login. This gates everything downstream: only on the user's own PR can any thread ever be auto-actioned. On someone else's PR, every thread goes through Step 4.

## Step 2: Fetch review threads

**Hand Steps 2–3 to `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, in `classify` mode** when it's available (`CONVENTIONS.md`): pass the PR's owner/repo/number, the user's login, whether the PR is theirs (Step 1), the query below, and Step 3's rules verbatim. When the user explicitly asked to remember something for the team, also pass `record-team: <one line>` (`CONVENTIONS.md`). It returns the buckets, notes where a thread matches something it remembers, and learns from the threads as it goes. Pick up at Step 4 with its buckets. Not available → do Steps 2–3 inline as written.

Pull review threads (not flat issue-level comments — the PR's general Conversation-tab comments, including anything you posted there yourself; those lack reply-chain semantics and are out of scope here) via GraphQL, so resolution state and comment order are available:

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 50) {
              nodes { databaseId author { login } body path line }
            }
          }
        }
      }
    }
  }' -f owner=<owner> -f repo=<repo> -F pr=<number> \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

The `--jq` filter drops resolved threads, so only unresolved ones land in context; path and line are enough to place a thread, so the diff hunk isn't fetched. Keep each thread's ordered comments — the last comment's author and content is what Step 3 classifies on.

## Step 3: Classify every unresolved thread into two buckets

For each thread, first check whether a reviewer — anyone other than the user — ever left a comment in it.

- **No reviewer ever participated** (every comment, including the first, is the user's own — a note left on their own diff) → on the user's own PR, the user's own comment already carries the authority a reviewer's comment plus a go-ahead reply would together; there's no separate reply to wait for. Treat the comment's own content as both the ask and its authorization, and classify it the same way the reply-driven case below does — not critical/high risk → straight to the automatic bucket; critical/high risk → "needs the user first," same as an acknowledged-but-risky reviewer thread:
  - **Authoritative** — reads like an instruction or actionable ask ("add a null check here", a `suggestion` block).
  - **Why-question** — reads like an open question needing research ("should this handle X too?").
- **A reviewer did participate** → look at who left the last comment and what it says:
  - **Ready to act automatically** — the last comment is the user's own, a short go-ahead/acknowledgment (not already a full answer — e.g. "Ok", "let's do it", "let me check", not a paragraph that already answers the question), *and* the original reviewer comment isn't critical/high risk (risk framing lives in Step 5a). Tag it with the nature of the *original* comment, not the reply:
    - **Authoritative** — an instruction, correction, or a ```suggestion``` code block ("do this", "use X instead").
    - **Why-question** — asks for reasoning or justification ("why this approach?").
  - **Needs the user first** — everything else:
    - The PR isn't the user's at all.
    - The last comment is from someone other than the user (no reply yet).
    - The last comment is the user's own, but it's already a complete answer/instruction rather than a short go-ahead — nothing to do; note it as already-handled, don't ask about it.
    - The user acknowledged it, but the underlying ask is critical/high risk and needs explicit confirmation.

## Step 4: Resolve the "needs the user first" bucket before applying anything

Non-empty → summarize each item briefly (file:line, who said what, and for a risky-but-acknowledged item, why it's flagged) and ask what they want done with each: implement it, draft a reply, or leave it alone. Don't apply any automatic action while items are still waiting on the user. Whatever they direct here folds into Step 5 alongside the automatic bucket.

Empty → skip straight to Step 5.

## Step 5: Handling comments

Apply every thread now settled — the automatic bucket from Step 3, plus whatever the user just approved in Step 4 — grouped by the nature of the original comment. This is the extension point for future comment categories: add new lettered sub-steps here (5c, 5d, ...) rather than new top-level steps.

### 5a. Authoritative

Before implementing anything from this sub-step, assess risk the same way this project weighs any action: is it hard to reverse, does it touch security/auth, cause data loss, touch production config/infra, break a public API, or otherwise carry a wide blast radius? Can't tell → it's risky and goes back through Step 4, same as always.

**Genuinely low-risk → hand it to a batch subagent; don't implement it here.** Fetching and classifying threads is cheap. The implement/test/commit loop is the expensive part: tens of steps, and on a host that resends the whole conversation every step (Cursor does), each of those steps pays for everything already in this chat — hundreds of thousands of tokens when `pr-address` runs late in a long session. A subagent starts a fresh conversation that holds only its task prompt, so the same loop runs at a fraction of the context. Every spawn and check still costs a step here, at this chat's full size, so batch the threads to keep those steps few. In this chat, don't grep, edit, or run tests for these threads. Instead:

1. **Batch.** Up to 10 ready threads go to one subagent. More than 10 → split into batches of at most 10, keeping threads on the same file in the same batch. Don't spawn explorers to survey the repo first — the subagent finds what it needs from each thread's path and line.
2. **Brief.** Get one `brief` from `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor (`CONVENTIONS.md`), passing the files about to change and each thread's ask. Keep only the rules it returns that apply — they go into the batch prompt, since the subagent can't consult the sidekick itself.
3. **Spawn, one batch at a time.** Batches share this checkout and branch, so only one subagent runs at any moment: start the next batch only after the previous one has returned. Never run two in parallel. Claude Code: the `general-purpose` agent. Cursor: a subagent. The task prompt is only this, filled in — no transcript, no PR diff, no copy of this skill, no repo tour:

   ```text
   Repo <owner>/<repo>, PR #<number>, branch <headRefName> (already checked out).
   Rules that apply: <brief lines, or "none">
   Threads:
   1. <path>:<line>, comment id <databaseId>
      Ask: <the reviewer's comment, or its suggestion block verbatim>
   2. ...

   For each thread in order: implement it (apply a suggestion block literally),
   run the tests affected by it, and commit it on its own once they pass.
   Stay inside each ask. If a thread needs more than its ask (other files'
   behavior, security/auth, a public API, config/infra), or its tests fail for
   a reason you can't fix inside the ask, discard that thread's uncommitted
   edits and go on to the next one.
   After the last thread, run the affected tests for all committed threads
   together. Fix a break only inside the asks; otherwise stop without pushing.
   Once they pass, push once, then reply on each committed thread with a
   one-line summary:
     gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -f body="<summary>"
   Do not resolve any thread. Do not run pr-sync.
   Return one line per thread: comment id, done (commit sha, reply posted
   yes/no) or skipped (why) — then one line for the final test run and push.
   ```

4. **Check.** Run `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, in `check-diff` mode once on the batch's commits. Anything it flags that's in scope for a thread → one follow-up subagent with just the flags and the shas, same prompt shape.
5. **Merge the result.** Note the per-thread lines and move on — don't ask for a longer report. A skipped thread → bring it back to the user with the reason, as in Step 4. A batch that stopped before pushing leaves its commits local → don't start the next batch; bring the whole batch and its failing tests to the user. A thread marked done without a reply → post the reply yourself:

   ```bash
   gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -f body="<summary>"
   ```

A thread the user approved in Step 4 despite its risk flag stays in this chat: implement it here with the same brief → implement and test → `check-diff` → commit and push → reply sequence, where the user can follow it. The host has no way to spawn a subagent → do low-risk threads the same way, here.

Do **not** resolve the thread — that's for the reviewer or the user.

### 5b. Why-question

Research a concise, accurate answer with real backing — documentation, a blog post, a forum thread, or relevant GitHub code/repos. Before posting, drop any backing resource that's private or otherwise inaccessible to the PR's reviewers; surface it to the user directly in-session instead, never into the PR comment. Reply the same way as 5a. Do **not** resolve the thread.

This stays in this chat — a lookup or two is cheap. When answering would take a long research loop, hand it to one subagent, prompted as sparely as 5a: the question, the path and line, and "research this, return a concise answer with public sources, don't post". Post the reply yourself.

## Step 6: Wrap up

Don't run `pr:pr-sync` from this skill — not in this chat, not in a subagent. It's a long rebase-and-redraft loop, the cost this skill avoids. Implementation changes were pushed **and the PR is the user's own** (per Step 1) → end the report with one line saying the description may now be stale and `/pr-sync` will update it. Never suggest it on a PR the user doesn't own — editing someone else's PR title or description isn't this skill's call. Report back concisely: how many threads were replied to or implemented, and how many are still open for manual resolution.

## When to stop instead of proceeding

- No PR found for the current branch or given argument → stop, say so. This skill doesn't create PRs.
- Can't determine risk confidently → treat it as risky and route it through Step 4.
- A why-question's only backing is a private/inaccessible resource → still answer in the PR reply from your own understanding where possible, but never paste the private link into the PR; hand it to the user in-session instead.
- The user hasn't replied in a thread yet → never auto-act on it, no matter how clearly authoritative or trivial the ask looks.
- Never resolve a review thread automatically — replying is as far as this skill goes.
