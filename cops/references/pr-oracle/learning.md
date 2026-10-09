# Learning

Personal rules live in `memory/users/<github-login>/MEMORY.md`; team rules live in `memory/team/MEMORY.md`. Keep each curated, not a log. A `record-team:` line goes only in the team file, never also in the personal file.

## What earns an entry

- An ask a reviewer has made at least twice across threads or PRs, or a rule the user stated outright, such as “we always colocate tests.”
- A suggestion the user rejected, together with their reason, so it is not raised again.
- A description preference the user stated outright.

Every entry must hold in any repository. Remove repository context when writing it: “a helper used by one function lives inside it,” not “in `packages/core`, …”.

Never record secrets or tokens, anything about a reviewer as a person, links of any kind, anything true of only one PR, or anything true of only one repository such as names, paths, packages, error classes, or setup. Repository setup belongs to `scout-repo`.

When a reviewer or user states a rule that only makes sense in this repository, record it nowhere. Add `promote: <rule>` to the output so the caller can suggest putting it in that repository's `CLAUDE.md`, where teammates and CI can see it.

## Format

Use one flat list beneath a single `## Everywhere` heading in personal and team files. A new file starts with that heading. Personal evidence is `(seen <n>x)` or `(stated by user)`. Team evidence from `record-team:` is `(stated by <github-login>)`.

```markdown
## Everywhere
- Why section: one sentence, no bullets  (seen 3x)
- A helper used by only one function lives inside that function  (stated by user)
- Rejected: barrel `index.ts` re-exports — "hurts tree-shaking"
```

## Upkeep

A first reviewer sighting goes in `memory/users/<github-login>/candidates.md`, which is not loaded automatically; read it whenever learning. Keep candidates in the same format. A second sighting promotes the candidate to `MEMORY.md`.

A repeat bumps the existing entry's count rather than adding a line. Merge near-duplicates, including pairs left by memory sync when two machines changed the same entry; sync uses a union merge and keeps both lines instead of stopping on a conflict. Add new entries at the end so the oldest remain at the top. When `MEMORY.md` nears 200 lines, drop the oldest single-sighting entries first.

An entry naming a repository, whether in personal files or the team file, stays only if it holds in every repository. Rewrite it without the repository or links and retain its count; otherwise drop it.
