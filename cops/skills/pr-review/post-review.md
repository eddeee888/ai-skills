# Shared review posting mechanics

`pr-review` and `pr-note` read this only after the user confirms the draft. The caller supplies signed bodies and event (`COMMENT` by default).

Immediately before writing, re-read full `headRefOid` (`gh api repos/<owner>/<repo>/pulls/<number> --jq .head.sha`; MCP `pull_request_read` `get`). Saved-head mismatch → stop, post nothing, offer a fresh review.

Post accepted comments in one review anchored to the saved `headRefOid`.

## `gh` route

Pick the absolute scratch dir `d` first (the session's, else `mktemp -d`; never under `.git`), then write the payload there (`CONVENTIONS-github.md` → "Passing drafted text to `gh`"):

```bash
d=<that absolute path>
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
