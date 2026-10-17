# Shared conventions: verification

A PR body's `## Verification` shows a reviewer why the change can be trusted.

## Verification checklist: name the test type, not the command

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

For checks run equivalently in CI, name the type: `- [x] Unit tests`, not `- [x] Ran \`pnpm test\``. Use literal commands only for manual checks beyond CI.

## Don't checklist an intentionally-failing check as done

For intentionally failing checkpoint tests, write `- [ ] Unit tests — intentionally failing, reproduces the bug`, never `- [x]`.

## Before and After: `### Before` / `### After` under `## Verification`

- **Verification is proof** on every PR. **Before/After is demonstration**, only for an observable surface. It never replaces Verification and never satisfies a card's Done when.

The PR body shows `### Before` then `### After` as two separate subsections under `## Verification`: never new top-level sections or side by side. Both list the same scenarios, by name and in order. Each scenario is `**<name>** — <status> @ <sha>` then a fenced text block (`api`/`cli` output, `architecture` Mermaid labelled `drawn`, or a `mock` labelled `mock`), the `manual` block, or `pending: drop <name>.png here`. No After yet: `pending: run /cops:pr-wrap-up`. The collapsed `<details>` evidence manifest sits there too; a rewritten body keeps all of it verbatim. A stale entry is labelled `stale since <sha>`, a stale screenshot goes back to `pending: drop <name>.png here`.

```text
manual: <scenario>
Needs: <what must be running or set up>
Expect: <what the output should show>
  <command>
```

Commands: the repo's own tooling only, nothing invented (no tooling: say what is missing); `Needs:` and `Expect:` required. The agent never runs it.
