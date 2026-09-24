---
name: pr-address
description: Work through a pull request's unresolved review threads and act on the ones the user has signaled they're ready for. On the user's own PR, a thread is acted on once the user replied last with a go-ahead ("Ok", "let me check"), or when the user commented on their own diff: an instruction or suggestion gets implemented, a why-question gets a backed-up answer. Threads awaiting someone else's reply, threads on someone else's PR, and high-risk changes go to the user in one batch first. Never resolves a thread. Use when asked to "address PR comments", "handle the review feedback", "respond to reviewers", or after leaving short replies like "Ok" on review comments.
---

# Address PR review comments

A reviewer's ask isn't the user's decision until the user weighs in. This skill treats the user's own short reply in a thread — or the user's own comment on their own diff — as that go-ahead, then carries it out. Everything else goes to the user in one batch first.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Identify the PR and whether it's the user's

```bash
gh pr view --json number,url,author,headRefName,baseRefName 2>&1
gh api user --jq .login
```

Use the current branch's PR unless the user gave a specific PR number/URL. No PR found → stop, see "When to stop" below.

Compare the PR's `author.login` to the authenticated user's login. This gates everything downstream: only on the user's own PR can any thread ever be auto-actioned. On someone else's PR, every thread goes through Step 4.

## Step 2: Fetch review threads

**Hand Steps 2–3 to `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, in `triage-threads` + `scout-repo` mode** when it's available (`CONVENTIONS.md` → "Consulting the `pr-sidekick` agent"): pass the PR's owner/repo/number, the user's login, whether the PR is theirs (Step 1), and Step 3's rules verbatim — not the query below; it fetches the threads with the GitHub MCP tools. When the user explicitly asked to remember something for the team, also pass `record-team: <one line>`. It returns the buckets, the remembered rules each thread matches, the repo profile (5a passes the rules and the profile's `tests` line on), and learns from the threads as it goes. Pick up at Step 4 with its buckets. Not available → do Steps 2–3 inline as written.

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

`--paginate` follows every page of threads, and the `--jq` filter keeps resolved ones out of context. Each thread carries its opening comment (`opening`, which Step 3 tags by nature) and its latest 20 (`recent`, whose last node is the last comment Step 3 classifies on) — never a truncated middle that hides the real last comment. `recent.totalCount` above 21 means comments in between aren't shown; if Step 3's bucket would turn on who wrote them, the thread needs the user first. An outdated comment has `line: null`; use its `originalLine`.

On the MCP route, use `pull_request_read` method `get_review_comments` instead, per the review-threads row in `CONVENTIONS.md` → "GitHub access" — it also says where each comment's `databaseId` comes from.

## Step 3: Classify every unresolved thread into two buckets

**High risk** means hard to reverse, security/auth, data loss, production config/infra, a public API, or a wide blast radius. Judge it from the comment text and file path alone — don't open code to decide. Can't tell → high risk.

- **Only the user ever commented** (a note on their own diff) → on the user's own PR, that comment is both the ask and the go-ahead. Not high risk → automatic; high risk → needs the user first. More than one comment, all the user's → the later ones are replies already posted (this skill replies as the user), so it's already handled — unless the last one is a new ask rather than a reply, which then counts as the note.
- **A reviewer commented** → automatic only when the last comment is the user's short go-ahead ("Ok", "let's do it", "let me check" — not a paragraph that already answers) and the ask isn't high risk. The last comment is the user's own full answer or instruction → already handled; note it, don't ask.

Tag each automatic thread by the nature of the *original* comment, not the reply:

- **Authoritative** — an instruction, correction, or ```suggestion``` block ("add a null check here", "use X instead").
- **Why-question** — asks for reasoning or research ("why this approach?", "should this handle X too?").
- **Both** — a question plus an instruction that depends on the answer ("does this work? find how others do it, then recommend") → a why-question. Answer it; the instruction waits for the user's go-ahead on the answer.

**Needs the user first** — everything else:

- The PR isn't the user's at all.
- The last comment is from someone other than the user (no reply yet).
- The user acknowledged it, but the ask is high risk and needs explicit confirmation.

## Step 4: Resolve the "needs the user first" bucket before applying anything

Non-empty → summarize each item briefly (file:line, who said what, and for a risky-but-acknowledged item, why it's flagged) and ask what they want done with each: implement it, draft a reply, or leave it alone. Don't apply any automatic action while items are still waiting on the user. Whatever they direct here folds into Step 5 alongside the automatic bucket.

Empty → skip straight to Step 5.

## Step 5: Handling comments

Apply every settled thread — Step 3's automatic bucket plus whatever the user approved in Step 4 — by the nature of the original comment.

### 5a. Authoritative

Low-risk threads go to a batch subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"). Don't grep, edit, or run tests for them here.

1. **Batch.** Up to 10 threads per subagent. More → batches of at most 10, same-file threads together. Don't spawn explorers to survey the repo first.
2. **Spawn, one batch at a time.** Batches share this checkout and branch: start the next only after the previous one has returned. The prompt carries no comment bodies — the subagent fetches them:

   ```text
   Repo <owner>/<repo>, PR #<number>, branch <headRefName> (already checked out).
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
   together. Fix a break only inside the asks; otherwise stop without pushing.
   Once they pass, push once, then reply on each committed thread with a
   one-line summary, single-quoted (write any ' as '\'') — never in double
   quotes, where backticks in the summary would run as commands:
     gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -f body='<summary>'
     (MCP: add_reply_to_pull_request_comment with commentId <databaseId>)
   Do not resolve any thread. Do not run pr-sync.
   Return one line per thread: comment id, done (commit sha, reply posted
   yes/no) or skipped (why) — then one line for the final test run and push.
   ```

3. **Check.** Run `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, in `sweep-diff` mode once on the batch's commits. Anything it flags that's in scope for a thread → one follow-up subagent with just the flags and the shas, same prompt shape.
4. **Merge the result.** Note the per-thread lines and move on — don't ask for a longer report. A skipped thread → bring it back to the user with the reason, as in Step 4. A batch that stopped before pushing leaves its commits local → don't start the next batch; bring the whole batch and its failing tests to the user. A thread marked done without a reply → post the reply yourself (text quoted per `CONVENTIONS.md` → "Passing drafted text to `gh`"):

   ```bash
   gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -f body='<summary>'
   ```

A thread the user approved in Step 4 despite its risk flag gets its own single-thread subagent, same prompt shape, run only after any low-risk batches — never batched with other threads, since it's the one most likely to stop. Before moving on, show the user its result line and commit, and run `sweep-diff` on it as above. No way to spawn a subagent → do every thread here: implement and test → `sweep-diff` → commit and push → reply.

Do **not** resolve the thread — that's for the reviewer or the user.

### 5b. Why-question

Research a concise, accurate answer with real backing — documentation, a blog post, a forum thread, or relevant GitHub code/repos. Before posting, drop any backing resource that's private or otherwise inaccessible to the PR's reviewers; surface it to the user directly in-session instead, never into the PR comment. Reply the same way as 5a — a multi-line answer goes in a file, `-F body=@<file>` (`CONVENTIONS.md` → "Passing drafted text to `gh`"). Do **not** resolve the thread.

Answer here only from what this chat already knows. Anything that needs a web fetch or reading code — a docs page or a source file can be thousands of tokens — goes to one subagent, prompted as sparely as 5a: the question, the path and line, and "research this, return a concise answer with public sources, don't post". Post the reply yourself.

## Step 6: Wrap up

Don't run `pr:pr-sync` from this skill — not in this chat, not in a subagent. It's a long rebase-and-redraft loop, the cost this skill avoids. Implementation changes were pushed **and the PR is the user's own** (per Step 1) → end the report with one line saying the description may now be stale and `/pr:pr-sync` (`/pr-sync` on Cursor) will update it. Never suggest it on a PR the user doesn't own — editing someone else's PR title or description isn't this skill's call. Report back concisely: how many threads were replied to or implemented, and how many are still open for manual resolution.

## When to stop instead of proceeding

- No PR found for the current branch or given argument → stop, say so. This skill doesn't create PRs.
- A why-question's only backing is a private/inaccessible resource → still answer in the PR reply from your own understanding where possible, but never paste the private link into the PR; hand it to the user in-session instead.
- The user hasn't replied in a thread yet → never auto-act on it, no matter how clearly authoritative or trivial the ask looks.
- Never resolve a review thread automatically — replying is as far as this skill goes.
