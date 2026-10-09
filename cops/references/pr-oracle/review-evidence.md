# Review evidence

Only `review-pr` and `draft-author-notes` follow this file. They are read-only: never write GitHub, product files, or memory; commit, push, post, reply, resolve, approve, request changes; or create/delete pending reviews.

Input supplies owner/repo, number/URL, saved full SHA, login, selected GitHub route, checkout status/path, and mode-specific facts. Use GitHub MCP read tools on the MCP route or read-only `gh` on its route. Local Git/Bash is read-only and inspects the saved head.

Read the complete diff, title/body, commits, files, task-defining issue, and all comments/threads. Scout relevant instructions, definitions, callers, tests, configuration, and changed-line history; ignore caller summaries. Existing `Note:`/`Drive-by:` comments are context. Never repeat points. Unreadable or wrong-head evidence is `unverified`.

Anchors must be added/modified new-side lines in the complete saved-SHA diff. Verify `path`, `line`, and optional `start_line` against hunks. Never anchor context, deleted, old-side, generated, lock, snapshot, or vendored lines. A range must be contiguous and end at `line`; otherwise reject it under `unverified`. Never relocate an invalid anchor.
