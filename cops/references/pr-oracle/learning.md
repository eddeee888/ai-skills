# Learning

Only `learn-feedback` follows this file. Personal active rules live in `memory/users/<github-login>/MEMORY.md`, inactive reviewer-derived candidates in `memory/users/<github-login>/candidates.md`, and team rules in `memory/team/MEMORY.md`. Keep each curated, not a log.

## Consent gate

Input must include concrete feedback or a rule, its provenance, and explicit user intent to remember, record for the team, or promote a named candidate. Missing any input means no write.

- A direct user rule may be written immediately to personal `MEMORY.md`.
- Reviewer-derived feedback is written only to `candidates.md`, regardless of repetition. It becomes active only when the user explicitly asks to promote that candidate.
- Candidate promotion moves or merges the rule into personal `MEMORY.md`; never infer promotion from agreement, repetition, or use.
- A team write requires the literal `record-team: <one line>` and goes only to team memory.

Every entry must hold in any repository. Remove repository context when writing. A repository-only rule is not stored; return it under `promote:` for the caller to suggest in that repository's `CLAUDE.md`.

Never record secrets or tokens, reviewer traits, links, one-PR facts, or repository-specific names, paths, packages, error classes, or setup.

## Format and upkeep

Use one flat list beneath `## Everywhere`. Direct rules use `(stated by user)`, reviewer candidates retain concise provenance, and team rules use `(stated by <github-login>)`.

```markdown
## Everywhere
- Why section: one sentence, no bullets  (seen 3x)
- A helper used by only one function lives inside that function  (stated by user)
- Rejected: barrel `index.ts` re-exports — "hurts tree-shaking"
```

Deduplicate exact and near-duplicate rules, preserving stronger evidence. Add new entries at the end. Keep active files below 200 lines by removing obsolete entries first. A requested team rule that contradicts a shared-convention contract or active team rule returns `conflict:` and is not written.
