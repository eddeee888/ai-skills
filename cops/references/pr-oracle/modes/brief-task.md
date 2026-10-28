# Mode: `brief-task`

Input: ask and affected files, or `PR description` for `cops:pr-wrap-up`, and optionally `for: pr-sidekick` and `for: task-card` (both may be passed).

Return every active rule (`../picking.md`), most relevant first, with evidence and any `applies-to:` text:

```text
- [<id>] <rule>  (<evidence from the entry>, from you | team)
```

No active rules → return exactly `no relevant memory`. Relevance only orders; never drop a rule.

With `for: pr-sidekick`, the caller pastes the brief into an editing subagent's prompt, its only source of memory. List the rules only the caller can act on after the brief under `caller only:` in the same line format. `no relevant memory` then covers only the brief; still add `caller only:` when it has lines.

**Evidence.** Only with `for: task-card`, for an ask (not `PR description`), always end with one `Evidence:` line for the caller's task card, a candidate list only:

```text
Evidence: <kind> — <scenario>, <scenario> (before/after)
```

Take kinds from the profile's `evidence:` line when `scout-repo` runs in the same call, and scenarios from the ask, at most 5 (`CONVENTIONS-evidence.md` → "Evidence scenarios"). No UI, API, CLI or architecture surface in the ask, no `scout-repo` in the same call, or no tooling in the profile: return `Evidence: none — <why>`. `no relevant memory` covers only the rules. Never capture anything.
