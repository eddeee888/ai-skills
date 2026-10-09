# Shared review posting mechanics

`pr-review` reads this after confirmation; `pr-note` posts without confirmation or `Approved:`. The caller supplies signed bodies and event (`COMMENT` by default).

Immediately before writing, re-read full `headRefOid` (`gh pr view <number> --json headRefOid --jq .headRefOid`; MCP `pull_request_read` `get`). Saved-head mismatch → stop, post nothing, offer a fresh review.

Post accepted comments in one review anchored to the saved `headRefOid`.

## `gh` route

Write the payload to a file (`CONVENTIONS-github.md` → "Passing drafted text to `gh`"):

```bash
d="$(git rev-parse --git-dir 2>/dev/null || mktemp -d)"
# $d/pr-review.json:
# {"commit_id":"<saved headRefOid>","event":"<COMMENT unless explicitly chosen otherwise>","body":"<top-level body or empty>","comments":[{"path":"<path>","line":<line>,"side":"RIGHT","body":"<signed body>"},{"path":"<path>","start_line":<start>,"start_side":"RIGHT","line":<end>,"side":"RIGHT","body":"<signed body>"}]}
gh api repos/<owner>/<repo>/pulls/<number>/reviews --input "$d/pr-review.json"
rm "$d/pr-review.json"
```

For `pr-note`, use `pr-note.json` throughout. Keep an empty body empty.

## MCP route

1. `pull_request_review_write` `create`: `commitID: <saved headRefOid>`, no `event`.
2. Per comment, `add_comment_to_pending_review`: `subjectType: LINE`, `side: RIGHT`, `line`; ranges add `startLine`, `startSide: RIGHT`.
3. After all succeed, `pull_request_review_write` `submit_pending` with event/body.

## Recovery

Never relocate, fold, or silently drop invalid anchors. Stop before submission where possible, report path/range, and redraft against verified new-side lines. On `gh`, report failure; don't retry unchanged.

Failure after MCP creates pending review → stop; report `pending review left: <what failed>`. Never auto-delete/submit/replace. Delete only on explicit request; create none while it remains.
