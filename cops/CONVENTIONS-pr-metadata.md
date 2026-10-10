# Shared conventions: pr metadata

## Monorepo title prefix: `[package-name]`

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

In a monorepo, prefix PR titles with `[package-name]`, naming only the package containing the primary/root-cause change: `[package-name] fix: ...`. Do not prefix issue titles.

## Trailing issue reference in the PR title: `(#123)`

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

Put a PR issue reference only at the end: `fix: <description> (#123)`. Resync preserves an existing trailing reference.

## Non-closing issue references: `Relates to #123` / `Refs #123`

A checkpoint or still-under-review fix PR that does not fully resolve its issue uses `Relates to #123` or `Refs #123`, never `Fixes`/`Closes`. Resync preserves the existing keyword and never changes closing ↔ non-closing semantics.

## Checkpoint/fix branch naming: `repro/<issue-number>` / `fix/<issue-number>`

A failing-test checkpoint branch is `repro/<issue-number>`; its separate fix branch is `fix/<issue-number>`.

## Non-issue branch naming: `<type>/<short-slug>`

A branch for work that isn't a checkpoint/fix pair is `<type>/<short-slug>`: type `feat`, `fix`, `chore`, or `refactor`; slug a few lowercase words joined by `-`, e.g. `feat/retry-webhook-delivery`. Never a bare number, so it can't clash with `fix/<issue-number>`.

## Bold the critical claim in Why/What/Verification bullets

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

Bold (`**...**`) only the causal reason, chosen rationale, caveat, or other critical fact in a Why/What/Verification bullet, never the whole sentence. If nothing is critical, use no bold.

## Split What into Main and Drive-by

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

When the diff includes task-unnecessary changes, split What into `### Main` and `### Drive-by`; give each drive-by one bullet explaining why it belongs. Without drive-bys, use plain bullets and no subsections.

## Verification checklist: name the test type, not the command

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

For checks run equivalently in CI, name the type: `- [x] Unit tests`, not `- [x] Ran \`pnpm test\``. Use literal commands only for manual checks beyond CI.

## Don't checklist an intentionally-failing check as done

For intentionally failing checkpoint tests, write `- [ ] Unit tests — intentionally failing, reproduces the bug`, never `- [x]`.

## Commit trailers: `Skill:` / `Approved-by:`

A marker commit carries trailers in its final paragraph:

```
fix: <short description> (#123)

Skill: oss:issue-fix
Approved-by: <login>
```

- `Skill: <plugin>:<skill>` is mandatory.
- `Approved-by: <login>` appears only when the user approved the committed change, using `gh api user --jq .login` or `get_me`; unasked commits omit it.
- Use one trailer block. Host trailers (`Co-Authored-By:`, `Claude-Session:`) follow without a blank line; no trailer must be last.
- Find with anchored grep:

```bash
git log --oneline --grep='^Skill: oss:issue-verify$' HEAD
```
