# Shared conventions: verification

A PR body's `## Verification` shows a reviewer why the change can be trusted.

- **Verification is proof** (tests, commands, results) on every PR. **Before/After is demonstration**, only for an observable surface. It never replaces Verification and never satisfies a card's Done when.

## Verification checklist: name the test type, not the command

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

For checks run equivalently in CI, name the type: `- [x] Unit tests`, not `- [x] Ran \`pnpm test\``. Use literal commands only for manual checks beyond CI.

## Don't checklist an intentionally-failing check as done

For intentionally failing checkpoint tests, write `- [ ] Unit tests — intentionally failing, reproduces the bug`, never `- [x]`.

## Before and After: `### Before` / `### After` under `## Verification`

The PR body shows `### Before` then `### After` as two separate subsections under `## Verification`: never new top-level sections, never side by side in one block. Both list the same scenarios, by name and in order, each with its status and the SHA it was taken at. Verification keeps its tests and commands. Evidence never holds a PR: a pending, stale or failed scenario is labelled, not blocking.
