# pr-address: Step 2 inline thread fetch

Read this file only when `pr-oracle` is unavailable and the main chat performs Steps 2–3 inline, or when the oracle's `triage-threads` mode points at its "`gh` route" section. Pull review threads, not conversation-tab comments; conversation comments have no reply chain and are out of scope.

## `gh` route

Try GraphQL first because REST comments do not provide the thread's resolution state:

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

`--paginate` follows `pageInfo.endCursor`; `--jq` keeps resolved threads out of context. Each result contains the opening comment, which determines the work's nature, and the latest 20 comments, whose final node drives classification. This avoids truncating away the actual last comment.

`recent.totalCount > 21` means middle comments are hidden: the one opening comment plus the 20 recent comments do not cover the full thread. If classification could turn on who wrote a hidden comment, classify it as `needs the user first`.

### GraphQL 403

It returns HTTP 403 "GitHub GraphQL is not available from Claude Code sessions" → read the threads and their comments over REST instead:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/ccr/review_threads --jq '.[] | select(.resolved | not)'
gh api --paginate repos/<owner>/<repo>/pulls/<number>/comments \
  --jq '.[] | {id, author:{login:.user.login}, body, path, line, original_line}'
```

Each thread is `{resolved, outdated, path, line, comment_ids}`. `comment_ids` are REST comment ids in order: the first opens the thread and is its id and `databaseId`, the last drives classification. Match each id to the comment list's `id`; no thread hides comments.

## MCP route

Use `pull_request_read` method `get_review_comments` as specified in `CONVENTIONS-github.md` → "GitHub access". Follow `after` while `pageInfo.hasNextPage`; do not stop at the first page. Drop every thread with `is_resolved: true`.

MCP comments do not expose `databaseId`. Derive it from the digits after `#discussion_r` in the comment's `html_url`. Keep this identifier because Step 5 uses it to fetch a full comment and post a reply.

## Lines and ordering

For an outdated comment, `line` is null or absent; use `originalLine` on GraphQL or `original_line` on REST and MCP as the effective line. Do not treat an outdated location as missing context.

Keep, for each unresolved thread:

- thread id and opening comment id;
- opening author, body, path, current line, and original line;
- the ordered recent comments and their authors;
- total comment count and whether the middle is hidden;
- the final comment;
- effective `path:line`.

After fetching every page, apply [classify.md](classify.md) exactly. Do not open repository code during classification.
