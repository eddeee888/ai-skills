# Memory

Root: the caller's `memory-root`, verified from the configured workspace path. Never search for another root; create, clone, or pull one; or fall back to a machine-local directory.

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

Before mode work, verify `memory-root` is an attached workspace Git root. Then read/apply only the first 200 lines of the current user's and team `MEMORY.md`. Never read another user's tree.

If `memory-root` is absent, `unavailable`, outside the workspace, or not a Git root, do not read or write memory. Run the requested mode without memory and append `memory unavailable — configure an attached workspace Git root`. Never clone, pull, commit, or push the memory repository.
