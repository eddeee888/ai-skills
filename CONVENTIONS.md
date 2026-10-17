# Shared conventions

Rules shared by marketplace skills and the `pr-oracle` checks that enforce them. Each pointer names one section; read only that section.

## Distribution and sync

Each plugin carries an identical copy of this core file and its six reference files at its root, two levels above each `SKILL.md`. Edit the seven root files, then copy all seven over `cops/` and `oss/`.

## Defaults and contracts

Each indexed section is:

- **Default** — marked *Default*. Apply unless overridden, strongest first: the user's current ask; repo `CLAUDE.md` or `CONTRIBUTING.md`; team memory; user memory; these files. The `pr-oracle` `scout-repo` profile lists repo/memory overrides on `overrides:`; follow it, with the current conversation above it.
- **Contract** — every other section. Nothing overrides it. If asked to override one, explain why that cannot apply and follow the contract.

## Index

- `CONVENTIONS-orchestration.md`
  - Hand long loops to a subagent
  - Handoffs in the final report
  - Companion plugin: `cops`
  - Suggesting next steps
  - Consulting the `pr-oracle` agent
- `CONVENTIONS-github.md`
  - GitHub access: `gh`, or the GitHub MCP tools
  - Passing drafted text to `gh`
- `CONVENTIONS-posts.md`
  - Comment labels: bold when writing, either form when reading
  - Comment body: short, one point per bullet
  - Citing sources: a link readers can open
  - Skill signature: `<sub>_Skill: [<plugin>:<skill>](…)_</sub>`
  - Author notes: `Note:` / `Drive-by:`
  - Critical changes
  - Approving drafts: one question per item
- `CONVENTIONS-pr-metadata.md`
  - Monorepo title prefix: `[package-name]`
  - Trailing issue reference in the PR title: `(#123)`
  - Non-closing issue references: `Relates to #123` / `Refs #123`
  - Checkpoint/fix branch naming: `repro/<issue-number>` / `fix/<issue-number>`
  - Non-issue branch naming: `<type>/<short-slug>`
  - Task size: `Size: Small — <reason>`
  - Bold the critical claim in Why/What/Verification bullets
  - Split What into Main and Drive-by
  - Commit trailers: `Skill:` / `Approved-by:`
- `CONVENTIONS-evidence.md`
  - Evidence scenarios: `Evidence: <kind> — <scenario>, … | none — <why>`
  - Evidence manifest: `<pr>/manifest.json`
  - Evidence status: `captured` … `not-captured`
  - Where evidence lives: scratch and `cops-evidence`
  - Staleness is not a `sweep-diff` check
- `CONVENTIONS-verification.md`
  - Verification checklist: name the test type, not the command
  - Don't checklist an intentionally-failing check as done
  - Before and After: `### Before` / `### After` under `## Verification`
