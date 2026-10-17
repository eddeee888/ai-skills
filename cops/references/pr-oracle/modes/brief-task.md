# Mode: `brief-task`

Input: ask and affected files, or `PR description` for `cops:pr-sync`, and optionally `for: pr-sidekick`.

Return only applicable active rules, most relevant first, with evidence:

```text
- <rule>  (<evidence from the entry>, from you | team)
```

If none, return exactly `no relevant memory`. Never pad.

With `for: pr-sidekick`, the caller pastes the brief into an editing subagent's prompt, its only source of memory. Also include every active rule on how code, tests, or commits are written that could apply to the affected files, even when the ask doesn't mention it. Leave out rules only the caller can act on (consulting the oracle, asking the user, when to push or squash) and list them after the brief under `caller only:` in the same line format. `no relevant memory` then covers only the brief; still add `caller only:` when it has lines.

**Evidence.** For an ask (not `PR description`) that changes a UI, API, CLI or architecture surface, end with one `Evidence:` suggestion for the caller's task card, a candidate list only:

```text
Evidence: <kind> — <scenario>, <scenario> (before/after)
```

Take kinds from the profile's `evidence:` line when `scout-repo` runs in the same call, and scenarios from the ask, at most 5 (`CONVENTIONS-evidence.md` → "Evidence scenarios"). No such surface → omit the line. `no relevant memory` covers only the rules. Never capture anything.
