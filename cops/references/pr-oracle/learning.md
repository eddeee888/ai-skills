# Learning

Only `learn-feedback` follows this file. Personal active rules live in `memory/users/<github-login>/MEMORY.md`, inactive reviewer-derived candidates in `memory/users/<github-login>/candidates.md`, and team rules in `memory/team/MEMORY.md`. Keep each curated, not a log.

## Consent gate

Input must include a concrete rule, its provenance, and explicit user intent to remember, record for the team, or promote a named candidate. Missing any input means no write.

A rule is **concrete** when it names a specific behavior and someone could check a diff or draft against it with a yes or no. "Always add a test for a fixed bug" and "Keep the Why to one sentence" are concrete. "Be less verbose", "remember that", or a fix for one PR are not. Never turn vague input into a rule by guessing what was meant.

- A direct user rule may be written immediately to personal `MEMORY.md`.
- Reviewer-derived feedback is written only to `candidates.md`, regardless of repetition. It becomes active only when the user explicitly asks to promote that candidate.
- Candidate promotion moves or merges the rule into personal `MEMORY.md`; never infer promotion from agreement, repetition, or use.
- A team write requires the literal `record-team: <one line>` and goes only to team memory.

Every entry must hold in any repository. Remove repository context when writing. A repository-only rule is not stored; return it under `promote:` for the caller to suggest in that repository's `CLAUDE.md`.

Never record secrets or tokens, reviewer traits, links, one-PR facts, or repository-specific names, paths, packages, error classes, or setup.

## Format and upkeep

Use one flat list beneath `## Everywhere`. Direct rules use `(stated by user)`, reviewer candidates retain concise provenance, and team rules use `(stated by <github-login>)`. A rule that only concerns some file types ends with `applies-to: <glob>[, <glob>]`, by type, never a repository path, such as `**/*.md` or `**/*.sh, **/*.bash`; one that holds for any file has none.

```markdown
Retired: U-002
## Everywhere
- [U-001] Why section: one sentence, no bullets  (seen 3x)
- [U-003] A helper used by only one function lives inside that function  (stated by user)  applies-to: **/*.ts, **/*.js
- [U-004] Rejected: barrel `index.ts` re-exports — "hurts tree-shaking"
```

**IDs.** Every rule bullet starts with a permanent `[X-nnn] ` ID; the letter is the file's namespace: `U` personal `MEMORY.md`, `C` `candidates.md`, `T` team `MEMORY.md`. Personal files share one number sequence; team has its own. A new rule gets the highest number ever used in its sequence + 1, counting rule IDs and `Retired:` lines, zero-padded to three digits. Never reuse a number. Deleting or merging away a rule adds its ID to the file's single `Retired:` line above the first heading. Editing a rule keeps its ID. Promoting keeps the number and takes the target's letter: `[C-007]` becomes `[U-007]`, and no ID is retired. Merging into an existing rule keeps that rule's ID and retires the other. A rule without an ID gets one the next time its file is written.

Deduplicate exact and near-duplicate rules, preserving stronger evidence and the older ID. Add new entries at the end. Keep active files below 200 lines by removing obsolete entries first. A requested team rule that contradicts a shared-convention contract or active team rule returns `conflict:` and is not written.
