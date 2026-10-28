# Picking rules

`brief-task`, `sweep-diff`, and `triage-threads`' `edit-rules:` use the same set: every active rule from `memory.md`'s files. Nothing is filtered or dropped.

- **`applies-to:` is a hint, not a filter.** Keep it on the rule's line. A rule whose globs match none of the paths in scope can't be broken there; the reader notes that and moves on.
- **Judgment only orders or checks.** `brief-task` orders rules, most relevant first; `sweep-diff` checks each against the diff. Never leave a rule out because the ask or diff doesn't mention it.
- **Caller-only rules.** A rule only the caller can act on (consulting the oracle, asking the user, when to push or squash) is returned as `caller only:`; `sweep-diff` skips it, since no diff can break it.
