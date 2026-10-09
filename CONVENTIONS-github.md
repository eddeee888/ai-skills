# Shared conventions: github

## GitHub access: `gh`, or the GitHub MCP tools

- **Pick the route once.** At the first GitHub step run `gh auth status`. Success → `gh` for the skill; failure (missing/unauthenticated) → GitHub MCP throughout, loading on-demand tools with `ToolSearch`. Neither works → use that step's own "no PR"/"can't reach the repo" failure.
- **Access errors.** On the `gh` route, retry one read returning 401/403/404 through MCP before failing.
- **Same effect, same gates.** MCP replaces commands one-for-one; writes retain every confirmation gate.
- **Owner/repo.** Derive from `git remote get-url origin`. Find current-branch PR with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`).
- **Subagents.** Prompts name the selected route; on MCP, name the corresponding tool beside each command.

| `gh` | GitHub MCP |
|---|---|
| `gh api user --jq .login` | `get_me` → `login` |
| `gh pr view [<number>] --json …` | `pull_request_read` method `get`; without number, find PR first |
| `gh pr create --draft --title … --body-file …` | `create_pull_request` with `draft: true`, `head`, `base` |
| `gh pr edit <number> --title … --body-file …` | `update_pull_request` with `title`, `body` |
| `gh pr diff <number>` | `pull_request_read` method `get_diff` |
| `gh api repos/<o>/<r>/pulls/<n>/reviews --input <file>` | `pull_request_review_write` `create` without `event`, `add_comment_to_pending_review` per comment, then `submit_pending` with `event` |
| review threads (`gh api graphql --paginate` … `reviewThreads`) | `pull_request_read` `get_review_comments`; follow `after` while `pageInfo.hasNextPage`; drop `is_resolved: true`; ID is digits after `#discussion_r` in `html_url`; absent `line` uses `original_line` |
| `gh api repos/<o>/<r>/pulls/comments/<id> --jq .body` | one `get_review_comments` pass; match `html_url` ending `#discussion_r<id>`, never fetch per comment |
| `gh api repos/<o>/<r>/pulls/<n>/comments/<id>/replies -f body=…` | `add_reply_to_pull_request_comment` with `commentId`, `pullNumber`, `body` |
| `gh issue view <n> --json …,comments` | `issue_read` `get`, then `get_comments` |
| `gh issue list --repo <o>/<r> --search … --state all` | `search_issues` with `owner`, `repo`, `query` |
| `gh issue create --repo <o>/<r> --title … --body-file …` | `issue_write` `create` |
| `gh issue comment <n> --body-file …` | `add_issue_comment` |
| `gh api repos/<o>/<r>/contents/<path>` | `get_file_contents` (`fields: ["name", "type"]` for directory) |
| `gh api repos/<o>/<r> --jq .default_branch` | `search_repositories` query `repo:<o>/<r>` → `default_branch` |

## Passing drafted text to `gh`

Never place drafted title/body/reply text in a double-quoted shell argument: backticks and `$` execute or expand.

- **Multi-line text** → write with a file-writing tool, never `echo` or an unquoted heredoc. Use `--body-file <file>` for `gh issue create|comment` and `gh pr create|edit`, or `-F body=@<file>` for `gh api`. Inside a checkout place it under `$(git rev-parse --git-dir)/`; otherwise use `mktemp -d`; remove afterward.
- **One line** → single-quote it, escaping `'` as `'\''`, or use `--title "$(cat <file>)"`; command output is not re-expanded.
- **MCP route** → pass text directly as the tool parameter.
