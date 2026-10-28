# Picking rules

`brief-task` and `sweep-diff` pick from one candidate set, by the same test. Never re-judge relevance per mode.

- **Candidate.** An active rule from `memory.md`'s files is a candidate when it has no `applies-to:`, or a glob matches a path in scope: `brief-task` the affected files (none known → every rule), `sweep-diff` the diff's changed paths.
- **Judgment only orders or checks.** Never drop a candidate because the ask or diff doesn't mention it. `brief-task` orders them; `sweep-diff` checks each against the diff.
- **Caller-only candidates.** A rule only the caller can act on (consulting the oracle, asking the user, when to push or squash) stays a candidate but is returned as `caller only:`; `sweep-diff` skips it, since no diff can break it.
