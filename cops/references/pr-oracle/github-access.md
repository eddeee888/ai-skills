# GitHub access

Read GitHub only through the `gh api` REST reads below, in Bash, whatever `GitHub route:` the input names; never MCP. Never write GitHub, use raw HTTP, or run any `gh` command the table doesn't list, including `gh auth status`: the caller already tested the route.

A file or directory read returning 404 means the path is absent. Any other read returning 401/403/404, except the review-thread GraphQL 403 below, → stop that read and return `gh api unavailable — read it in the main chat`.

| Read | `gh api` read |
|---|---|
| Default branch | `gh api repos/<owner>/<repo> --jq .default_branch` |
| File or directory | `gh api repos/<owner>/<repo>/contents/<path>`, no trailing slash; for a file add `-H 'Accept: application/vnd.github.raw'`; for a directory add `--jq 'map({name, type})'` |
| Review threads | `gh api graphql --paginate` with the `reviewThreads` query `modes/triage-threads.md` names; GraphQL 403 → `gh api repos/<owner>/<repo>/pulls/<number>/ccr/review_threads` and `gh api --paginate repos/<owner>/<repo>/pulls/<number>/comments` |
| PR body | `gh api repos/<owner>/<repo>/pulls/<number> --jq '{title, body}'` |
| PR diff | `gh api repos/<owner>/<repo>/pulls/<number> -H 'Accept: application/vnd.github.diff'` |

For review threads, follow the pagination and ID rules in `modes/triage-threads.md`.
