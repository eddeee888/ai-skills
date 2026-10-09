# GitHub access

Read GitHub only through this read-only allowlist. On a host that loads tools on demand, load each tool with `ToolSearch` before its first use. Do not use `gh`, raw HTTP, Bash, or any GitHub write tool.

| Read | GitHub MCP route |
|---|---|
| Default branch | `search_repositories` with query `repo:<owner>/<repo>`; use `default_branch` |
| File or directory | `get_file_contents`; for a directory request `fields: ["name", "type"]` |
| Review threads | `pull_request_read` method `get_review_comments`; follow the pagination and ID rules in `modes/triage-threads.md` |
| PR body | `pull_request_read` method `get` |
| PR diff | `pull_request_read` method `get_diff` |

The frontmatter tool names are `mcp__github__get_file_contents`, `mcp__github__search_repositories`, and `mcp__github__pull_request_read`. No other GitHub MCP tool is permitted.
