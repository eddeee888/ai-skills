# Shared conventions: github

## GitHub access: `gh`, or the GitHub MCP tools

- **Pick the route once.** At the first GitHub step run `gh api repos/<o>/<r> --jq .default_branch`. Success → `gh api` for the skill; failure → GitHub MCP throughout, loading on-demand tools with `ToolSearch`. Neither works → that step's own "no PR"/"can't reach the repo" failure.
- **REST through `gh api`.** `gh pr|issue …` and `gh api graphql` use GraphQL, which Claude Code cloud blocks (403 "GitHub GraphQL is not available"); only review threads and ready try it first. Branches and commits go through `git push`.
- **Access errors.** On the `gh` route, retry one read returning 401/403/404 through MCP before failing.
- **Same effect, same gates.** MCP replaces commands one-for-one; writes retain every confirmation gate.
- **Owner/repo.** Derive from `git remote get-url origin`.
- **Subagents.** Always `gh api` through Bash, never MCP; prompts say `GitHub: gh api`. The main agent alone creates, edits, labels, assigns and reviews PRs; a subagent only replies to a thread when its prompt says to.

| `gh` | GitHub MCP |
|---|---|
| `gh api user --jq .login` | `get_me` → `login` |
| `gh api repos/<o>/<r>/pulls/<n>` | `pull_request_read` method `get` |
| `gh api 'repos/<o>/<r>/pulls?head=<o>:<branch>&state=open'` (current-branch PR) | `list_pull_requests` (`head: <o>:<branch>`, `state: open`) |
| `gh api -X POST repos/<o>/<r>/pulls -f title=… -F body=@<file> -f head=… -f base=… -F draft=true` | `create_pull_request` with `draft: true`, `head`, `base` |
| `gh api -X PATCH repos/<o>/<r>/pulls/<n> -f title=… -F body=@<file>` | `update_pull_request` with `title`, `body` |
| `gh pr ready <n>`; GraphQL 403 → `gh api -X POST repos/<o>/<r>/pulls/<n>/ccr/ready_for_review` | `update_pull_request` with `draft: false` |
| `gh api -X POST repos/<o>/<r>/issues/<n>/assignees -f 'assignees[]=<login>'` | `issue_write` `update` with `issue_number`, `assignees` |
| `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=<name>'` | `issue_write` `update` with `issue_number`, `labels` |
| `gh api repos/<o>/<r>/labels/<name>`; 404 → absent | `get_label`; not found → absent |
| `gh api repos/<o>/<r>/pulls/<n> -H 'Accept: application/vnd.github.diff'` | `pull_request_read` method `get_diff` |
| `gh api repos/<o>/<r>/pulls/<n>/reviews --input <file>` | `pull_request_review_write` `create` without `event`, `add_comment_to_pending_review` per comment, then `submit_pending` with `event` |
| review threads: `gh api graphql --paginate` … `reviewThreads`; GraphQL 403 → `gh api repos/<o>/<r>/pulls/<n>/ccr/review_threads` (`cops/skills/pr-address/fetch-threads.md`) | `pull_request_read` `get_review_comments`; follow `after` while `pageInfo.hasNextPage`; drop `is_resolved: true`; ID is digits after `#discussion_r` in `html_url`; absent `line` uses `original_line` |
| `gh api repos/<o>/<r>/pulls/comments/<id> --jq .body` | one `get_review_comments` pass; match `html_url` ending `#discussion_r<id>`, never fetch per comment |
| `gh api -X POST repos/<o>/<r>/pulls/<n>/comments/<id>/replies -F body=@<file>` | `add_reply_to_pull_request_comment` with `commentId`, `pullNumber`, `body` |
| `gh api repos/<o>/<r>/issues/<n>`, then `…/issues/<n>/comments` | `issue_read` `get`, then `get_comments` |
| `gh api -X GET search/issues -f q='repo:<o>/<r> is:issue <keywords>'` | `search_issues` with `owner`, `repo`, `query` |
| `gh api -X POST repos/<o>/<r>/issues -f title=… -F body=@<file>` | `issue_write` `create` |
| `gh api -X POST repos/<o>/<r>/issues/<n>/comments -F body=@<file>` | `add_issue_comment` |
| `gh api repos/<o>/<r>/contents/<path>`, no trailing slash | `get_file_contents` (`fields: ["name", "type"]` for directory) |
| `gh api repos/<o>/<r> --jq .default_branch` | `search_repositories` query `repo:<o>/<r>` → `default_branch` |

## Passing drafted text to `gh`

Never place drafted title/body/reply text in a double-quoted shell argument: backticks and `$` execute or expand.

- **Multi-line text** → write with a file-writing tool, never `echo` or an unquoted heredoc. Pass it as `-F body=@<file>`. Place it by absolute path in the session's scratch directory, else a `mktemp -d` directory; never under `.git`, never `cd` there; remove afterward.
- **One line** → single-quote it, escaping `'` as `'\''`, or use `-f title="$(cat <file>)"`; command output is not re-expanded.
- **MCP route** → pass text directly as the tool parameter.
