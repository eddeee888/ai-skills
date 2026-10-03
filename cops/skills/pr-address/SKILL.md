---
name: pr-address
description: Work through a pull request's unresolved review threads and act on the ones the user has signaled they're ready for. On the user's own PR, a thread is acted on once the user replied last with a go-ahead ("Ok", "let me check"), or when the user commented on their own diff: an instruction or suggestion gets implemented, a why-question gets a backed-up answer. Threads awaiting someone else's reply, threads on someone else's PR, and high-risk changes go to the user in one batch first. Never resolves a thread. Use when asked to "address PR comments", "handle the review feedback", "respond to reviewers", or after leaving short replies like "Ok" on review comments.
---

# Address PR review comments

A reviewer's ask isn't the user's decision until the user weighs in. The user's own short reply in a thread — or their own comment on their own diff — is the go-ahead; this skill carries it out. Everything else goes to the user in one batch first.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Identify the PR and whether it's the user's

```bash
gh pr view --json number,url,author,headRefName,baseRefName 2>&1
gh api user --jq .login
```

Use the current branch's PR unless the user gave a PR number/URL. No PR found → stop (see "When to stop").

Compare the PR's `author.login` to the authenticated login. This gates everything: only on the user's own PR can a thread be auto-actioned. On someone else's PR, every thread goes through Step 4.

## Step 2: Fetch review threads

**Hand Steps 2–3 to `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `triage-threads` + `scout-repo` mode** when available (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"): pass the PR's owner/repo/number, the user's login, whether the PR is theirs (Step 1), and Step 3's rules verbatim — not the query below; it fetches the threads with the GitHub MCP tools. If the user explicitly asked to remember something for the team, also pass `record-team: <one line>`. It returns the buckets, the remembered rules each thread matches, and the repo profile (5a passes the rules and the profile's `tests` line on), learning from the threads as it goes. Pick up at Step 4 with its buckets. Not available → do Steps 2–3 inline.

Pull review threads via GraphQL, for resolution state and comment order. Conversation-tab comments are out of scope — they have no reply chain.

```bash
gh api graphql --paginate -f query='
  query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $endCursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            opening: comments(first: 1) {
              nodes { databaseId author { login } body path line originalLine }
            }
            recent: comments(last: 20) {
              totalCount
              nodes { databaseId author { login } body path line originalLine }
            }
          }
        }
      }
    }
  }' -f owner=<owner> -f repo=<repo> -F pr=<number> \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

`--jq` keeps resolved threads out of context. Each thread carries its opening comment (`opening`, which Step 3 tags by nature) and its latest 20 (`recent`, whose last node is the one Step 3 classifies on) — never a truncated middle hiding the real last comment. `recent.totalCount` above 21 means middle comments are hidden; if Step 3's bucket would turn on who wrote them, the thread needs the user first. An outdated comment has `line: null`; use its `originalLine`.

On the MCP route, use `pull_request_read` method `get_review_comments`, per the review-threads row in `CONVENTIONS.md` → "GitHub access" — it also says where each comment's `databaseId` comes from.

## Step 3: Classify every unresolved thread into two buckets

**High risk** means hard to reverse, security/auth, data loss, production config/infra, a public API, or a wide blast radius. Judge from the comment text and file path alone — don't open code. Can't tell → high risk.

- **Only the PR's author ever commented, and the opening comment starts with `Note:` or `Drive-by:`** → an author note explaining the change, not an ask (`CONVENTIONS.md` → "Author notes"). Already handled: don't implement or answer it. Someone else has replied → classify from the last comment, as below.
- **Only the user ever commented** (a note on their own diff) → on the user's own PR, that comment is both ask and go-ahead. Not high risk → automatic; high risk → needs the user first. Several comments, all the user's → the later ones are replies already posted (this skill replies as the user), so it's handled — unless the last is a new ask rather than a reply, which then counts as the note.
- **A reviewer commented** → automatic only when the last comment is the user's short go-ahead ("Ok", "let's do it", "let me check" — not a paragraph that already answers) and the ask isn't high risk. Last comment is the user's own full answer or instruction → already handled; note it, don't ask.

Tag each automatic thread by the nature of the *original* comment, not the reply:

- **Authoritative** — an instruction, correction, or ```suggestion``` block ("add a null check here", "use X instead").
- **Why-question** — asks for reasoning or research ("why this approach?", "should this handle X too?").
- **Both** — a question plus an instruction that depends on the answer ("does this work? find how others do it, then recommend") → a why-question. Answer it; the instruction waits for the user's go-ahead on the answer.

**Needs the user first** — everything else:

- The PR isn't the user's.
- The last comment is from someone other than the user (no reply yet).
- The user acknowledged it, but the ask is high risk and needs explicit confirmation.

## Step 4: Resolve the "needs the user first" bucket before applying anything

Non-empty → summarize each item briefly (file:line, who said what, and for a risky-but-acknowledged item, why it's flagged) and ask what to do with each: implement it, draft a reply, or leave it. Apply no automatic action while items are waiting. Whatever they direct folds into Step 5 with the automatic bucket.

Empty → go to Step 5.

## Step 5: Handling comments

Apply every settled thread — Step 3's automatic bucket plus what the user approved in Step 4 — by the nature of the original comment.

### 5a. Authoritative

Low-risk threads go to a batch subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"). Don't grep, edit, or run tests for them here.

1. **Batch.** At most 10 threads per subagent, same-file threads together. Don't spawn explorers to survey the repo first.
2. **Spawn, one batch at a time.** Batches share this checkout and branch: start the next only after the previous returned. The prompt carries no comment bodies — the subagent fetches them:

   ```text
   Repo <owner>/<repo>, PR #<number>, branch <headRefName> (already checked out).
   login: <the user's login from Step 1>
   Rules that apply: <the threads' "remembered" lines from triage-threads, or "none">
   Tests: <the profile's tests line, or "find out">
   GitHub: <"gh" | "MCP — use the GitHub MCP tools named below instead of gh; load each with ToolSearch first if needed">
   Threads:
   1. <path>:<line>, comment id <databaseId> — <one-line ask>
   2. ...

   Read each thread's full comment with
     gh api repos/<owner>/<repo>/pulls/comments/<databaseId> --jq .body
     (MCP: call pull_request_read method get_review_comments once, following
     `after` through every page, and look up every thread above in that one
     result — the comment whose html_url ends in #discussion_r<databaseId>.
     Never refetch the list per thread.)
   For each thread in order: implement it (apply a suggestion block
   literally), run the tests affected by it with a quiet reporter, and commit
   it on its own once they pass. Stay inside each ask. If a thread needs more
   than its ask (other files' behavior, security/auth, a public API,
   config/infra), or its tests still fail after 3 attempts inside the ask,
   discard that thread's uncommitted edits and go on to the next one.
   After the last thread, run the affected tests for all committed threads
   together. Fix a break only inside the asks; otherwise stop and say which
   tests still fail.
   Do not push, reply on any thread, resolve any thread, or run pr-sync.
   Return one line per thread: comment id, done (commit sha, one-line
   summary for the reply) or skipped (why) — then one line for the final
   test run.
   ```

3. **Check, before pushing.** Run `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `sweep-diff` mode once on the batch's commits (from the commit before the batch to `HEAD`). Anything it flags that's in scope for a thread → one follow-up subagent with just the flags and the shas, same prompt shape; it commits the fixes, still without pushing.
4. **Push and reply.** Use the per-thread lines — don't ask for a longer report. The batch's final test run failed → don't push or start the next batch; bring the whole batch and its failing tests to the user. Otherwise `git push` once, then reply on each done thread with its one-line summary, single-quoted (`CONVENTIONS.md` → "Passing drafted text to `gh`"; on the MCP route, `add_reply_to_pull_request_comment` with `commentId: <databaseId>`):

   ```bash
   gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -f body='<summary>'
   ```

   A skipped thread → bring it to the user with the reason, as in Step 4.

A thread the user approved in Step 4 despite its risk flag gets its own single-thread subagent, same prompt shape, after any low-risk batches — never batched, since it's the most likely to stop. Before moving on, show the user its result line and commit, then check, push and reply as above. No way to spawn a subagent → do every thread here: implement, test and commit → `sweep-diff` → push → reply.

Do **not** resolve the thread — that's for the reviewer or the user.

### 5b. Why-question

Research a concise, accurate answer with real backing — documentation, a blog post, a forum thread, or relevant GitHub code/repos. Drop any backing resource that's private or inaccessible to the PR's reviewers; surface it to the user in-session, never in the PR comment. Reply as in 5a — a multi-line answer goes in a file, `-F body=@<file>` (`CONVENTIONS.md` → "Passing drafted text to `gh`"). Do **not** resolve the thread.

Answer here only from what this chat already knows. Anything needing a web fetch or reading code (a docs page or source file can be thousands of tokens) goes to one subagent, prompted as sparely as 5a: the question, the path and line, and "research this, return a concise answer with public sources, don't post". Post the reply yourself.

## Step 6: Wrap up

Don't run `cops:pr-sync` from this skill. Implementation changes were pushed **and the PR is the user's own** (per Step 1) → suggest `pr-sync` (`CONVENTIONS.md` → "Suggesting next steps"). Report concisely: how many threads were replied to or implemented, and how many remain open for manual resolution. End with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with labels `triage-threads + scout-repo`, `5a batch` (one per batch), `5b research`, and `sweep-diff`.

## When to stop instead of proceeding

- No PR found for the current branch or given argument → stop, say so. This skill doesn't create PRs.
- A why-question's only backing is private/inaccessible → still answer in the PR from your own understanding where possible, but never paste the private link into the PR; hand it to the user in-session.
- The user hasn't replied in a thread yet → never auto-act on it, however authoritative or trivial the ask looks.
- Never resolve a review thread — replying is as far as this skill goes.
