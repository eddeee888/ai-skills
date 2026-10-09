# Memory

Root: the sole Git repository among the attached workspace roots with a root-level `.cops-memory` marker. Never create, clone, pull, or fall back to a machine-local memory directory.

```text
memory/
  users/<github-login>/
    MEMORY.md
    candidates.md
  team/
    MEMORY.md
```

Write only these files. Store only cross-repository rules; never name a repository or link its PR.

`<github-login>` is caller-supplied or from `get_me`; never use Git/machine identity. If unknown, skip personal writes, still read team memory, and return `login unknown — personal memory not written`.

Write personal data only under `memory/users/<github-login>/`. Team writes require `learn-feedback` with `record-team:`. Never store repository-only rules.

Before mode work, find marked repositories only among attached workspace roots. Exactly one is required. Then read/apply only the first 200 lines of the current user's and team `MEMORY.md`. Never read another user's tree.

If none or more than one is found, do not read or write memory. Run the requested mode without memory and append `memory unavailable — attach exactly one marked memory repository to the workspace`. Never create, clone, pull, commit, or push the memory repository.
