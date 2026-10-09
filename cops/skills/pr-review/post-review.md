# Shared review posting mechanics

`cops:pr-review` reads this only after the user confirms its visible draft. `cops:pr-note` also uses it, but its own contract deliberately posts without confirmation and omits `Approved:`. The caller supplies the event and signed bodies; this file does not change either skill's safety gate or signature policy.

Post every inline comment in one review so the author receives one notification. Anchor the review to the caller's saved `headRefOid`, not a freshly read head.

## `gh` route

Write the payload with the file-writing tool as required by `CONVENTIONS-github.md` → "Passing drafted text to `gh`":

```bash
d="$(git rev-parse --git-dir 2>/dev/null || mktemp -d)"
# $d/pr-review.json:
# {"commit_id": "<headRefOid>", "event": "<COMMENT unless caller explicitly chose otherwise>", "body": "<top-level body or empty>",
#  "comments": [{"path": "<path>", "line": <line>, "side": "RIGHT", "body": "<signed body>"},
#               {"path": "<path>", "start_line": <start>, "start_side": "RIGHT",
#                "line": <end>, "side": "RIGHT", "body": "<signed body>"}]}
gh api repos/<owner>/<repo>/pulls/<number>/reviews --input "$d/pr-review.json"
rm "$d/pr-review.json"
```

The commands show `pr-review`. When called by `pr-note`, substitute `pr-note.json` in all three places. Keep an empty top-level body empty: do not add a signature just to populate it. A non-empty top-level body follows the caller's signature policy.

## MCP route

1. Call `pull_request_review_write` method `create` with `commitID: <headRefOid>` and no `event`; this creates a pending review.
2. Call `add_comment_to_pending_review` once per comment with `subjectType: LINE`, `side: RIGHT`, and `line`. For a range, also pass `startLine` and `startSide: RIGHT`.
3. Call `pull_request_review_write` method `submit_pending` with the caller's event (`COMMENT` by default) and top-level `body`.

Do not submit before all comments have been added.

## Recovery

If GitHub rejects an inline comment because its line is outside the diff, move it to the nearest changed line it concerns. For `pr-review`, if no suitable changed line exists, fold it into the top-level body. For `pr-note`, its caller's stricter rule applies: omit it and report it under `not posted`. Never silently lose a rejected comment.

A failure after MCP creates the pending review leaves a draft visible only to the user. Stop and report `pending review left: <what failed>`. Delete it with `pull_request_review_write` method `delete_pending` only when the user explicitly says to; never clean it up automatically or create a replacement review while it remains.
