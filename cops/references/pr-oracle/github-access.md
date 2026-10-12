# GitHub access

Input supplies the selected GitHub route as `GitHub route: gh | MCP`; none given → MCP route. Read GitHub only through that route's read-only allowlist below. Never write GitHub, use raw HTTP, or run any `gh` command the table doesn't list, including `gh auth status`: the caller already picked the route.

- **`gh` route.** Bash runs only the listed `gh` reads. A file or directory read returning 404 means the path is absent. Any other read returning 401/403/404 → retry that one read through its GitHub MCP counterpart before failing (`CONVENTIONS-github.md` → "GitHub access").
- **MCP route.** On a host that loads tools on demand, load each tool with `ToolSearch` before its first use. Bash never reads GitHub.

| Read | `gh` route | GitHub MCP route |
|---|---|---|
| Default branch | `gh api repos/<owner>/<repo> --jq .default_branch` | `search_repositories` with query `repo:<owner>/<repo>`; use `default_branch` |
| File or directory | `gh api repos/<owner>/<repo>/contents/<path>`; for a file add `-H 'Accept: application/vnd.github.raw'`; for a directory add `--jq 'map({name, type})'` | `get_file_contents`; for a directory request `fields: ["name", "type"]` |
| Review threads | `gh api graphql --paginate` with the `reviewThreads` query `modes/triage-threads.md` names | `pull_request_read` method `get_review_comments` |
| PR body | `gh pr view <number> --repo <owner>/<repo> --json title,body` | `pull_request_read` method `get` |
| PR diff | `gh pr diff <number> --repo <owner>/<repo>` | `pull_request_read` method `get_diff` |

For review threads, follow the pagination and ID rules in `modes/triage-threads.md`.

The frontmatter tool names are `mcp__github__get_file_contents`, `mcp__github__search_repositories`, and `mcp__github__pull_request_read`. No other GitHub MCP tool is permitted.
