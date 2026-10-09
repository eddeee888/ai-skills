# pr-address: Step 5a implementation

Read this file only after Step 4 has settled every user decision and immediately before any authoritative thread is edited, tested, committed, pushed, or answered.

## Batch and handoff

Send low-risk threads to `pr-sidekick` as required by `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent". Put at most 10 threads in a batch, keep same-file threads together, and run batches sequentially on the shared checkout. Do not survey the repo with an explorer first. Start no later batch until the current batch has passed every test, sweep, push, and reply gate.

Use this exact prompt shape; it intentionally carries no full comment bodies:

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
summary for the reply) or skipped (why) — then one line for the final test run.
```

No subagent capability means perform the same implement/test/commit loop inline and mark the handoff as required by `CONVENTIONS-orchestration.md`; convenience is not unavailability.

## Check gate

If the final combined test run fails, do not push, reply, or start another batch. Bring the entire batch and failing tests to the user.

For a passing batch, call `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor once in `sweep-diff` mode over the batch's commits, from the commit immediately before the batch through `HEAD` (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Any in-scope flag gets one follow-up implementation handoff containing only the flags and commit SHAs, using the same prompt constraints. It commits fixes and still does not push. A flag outside all asks returns to the user rather than broadening the work.

## Push and reply gate

Only after passing tests and the sweep, run `git push` once for the batch. Then post one reply for every `done` line using its one-line summary and `CONVENTIONS-posts.md` → "Comment body". Sign with `cops:pr-address` and `Approved: <login>` as `CONVENTIONS-posts.md` → "Skill signature" requires.

Write each signed body to a file as `CONVENTIONS-github.md` → "Passing drafted text to `gh`" requires, then:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -F body=@<file>
```

On MCP, use `add_reply_to_pull_request_comment` with `commentId: <databaseId>`, `pullNumber`, and `body`. A skipped thread returns to the user with its reason. Never resolve a thread.

## High-risk approved work

After all low-risk batches, run each explicitly approved high-risk thread as its own single-thread handoff with the same prompt. Never batch it. Before any push or reply, show the user its result line and commit, then perform the same combined-test and `sweep-diff` gates. Push and reply only after those gates pass. Approval for one risky thread does not cover another.
