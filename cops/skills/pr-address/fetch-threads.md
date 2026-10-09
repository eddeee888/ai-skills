# pr-address: Step 2 inline thread fetch

Read this file only when `pr-oracle` is unavailable and the main chat must perform Steps 2–3 inline. Pull review threads, not conversation-tab comments; conversation comments have no reply chain and are out of scope.

## `gh` route

Use GraphQL because REST comments do not provide the thread's resolution state and ordered comment history:

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

## MCP route

Use `pull_request_read` method `get_review_comments` as specified in `CONVENTIONS-github.md` → "GitHub access". Follow `after` while `pageInfo.hasNextPage`; do not stop at the first page. Drop every thread with `is_resolved: true`.

MCP comments do not expose `databaseId`. Derive it from the digits after `#discussion_r` in the comment's `html_url`. Keep this identifier because Step 5 uses it to fetch a full comment and post a reply.

## Lines and ordering

For an outdated comment, `line` is null or absent; use `originalLine` on GraphQL or `original_line` on MCP as the effective line. Do not treat an outdated location as missing context.

Keep, for each unresolved thread:

- thread id and opening comment id;
- opening author, body, path, current line, and original line;
- the ordered recent comments and their authors;
- total comment count and whether the middle is hidden;
- the final comment;
- effective `path:line`.

After fetching every page, apply [classify.md](classify.md) exactly. Do not open repository code during classification.
