# Mode: `brief-task`

Input: ask and affected files, or `PR description` for `cops:pr-sync`, and optionally `for: pr-sidekick`.

Return only applicable active rules, most relevant first, with evidence:

```text
- [<key>] <rule>  (<evidence from the entry>, from you | team)
```

Copy each rule's `<key>` from the prompt's `rule-keys:` list; leave `[<key>] ` out when the prompt has no such list or doesn't list the rule. Never invent a key.

If none, return exactly `no relevant memory`. Never pad.

With `for: pr-sidekick`, the caller pastes the brief into an editing subagent's prompt, its only source of memory. Also include every active rule on how code, tests, or commits are written that could apply to the affected files, even when the ask doesn't mention it. Leave out rules only the caller can act on (consulting the oracle, asking the user, when to push or squash) and list them after the brief under `caller only:` in the same line format. `no relevant memory` then covers only the brief; still add `caller only:` when it has lines.
