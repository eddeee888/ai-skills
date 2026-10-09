# Memory

Root: `${PR_MEMORY_DIR:-${CLAUDE_PLUGIN_OPTION_MEMORY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cops-memory}}`. With `PR_MEMORY_REPO`, hooks sync this checkout; otherwise memory is local:

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

Before mode work, read/apply only the first 200 lines of the current user's and team `MEMORY.md`. Never read another user's tree.

If `PR_MEMORY_REPO` is set, root is not Git, and a plugin-root variable exists, run `"${CURSOR_PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/memory-sync.sh" pull` before reading. If unreachable and attachment is requested, use the exact sync suffix. Never push.

One-time legacy import allows this user's/team trees from `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-memory/memory`, preserving and backing up sources and deduplicating lines. It also backs up `agent-memory/cops-pr-oracle/MEMORY.md`, ignores the exact old index boilerplate, and converts safe line-oriented text into the current user's inactive `candidates.md` with provenance—never active memory. It records completion only after an actual structured or stub import; no source leaves no marker. Never read legacy memory directly.
