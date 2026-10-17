# pr-wrap-up: capture the after

Read this when the PR body holds a `<details>` evidence manifest. Manifest, statuses, stale check, `how` guardrail, hand-edited manifest and secret backstop: `CONVENTIONS-evidence.md`.

## Procedure

Deterministic: no model call, no oracle.

1. Run the stale check per `CONVENTIONS-evidence.md`. A hand-edited manifest ends here.
2. Capture the after of each scenario with no after or a stale one, never the before, with the manifest's `how`, local-only. Success → the new `@ <sha>` and status. Failure or a stale screenshot: the labels in `CONVENTIONS-verification.md`.
3. Update the manifest and the Before/After entries in the body draft (`CONVENTIONS-verification.md` → "Before and After"); nothing else in them changes. A pasted `manual` result is recorded as `captured-by-user` after the secret backstop.

## Return item

`evidence (n captured, n stale, n none)`: scenarios captured, left stale, and with nothing to do.
