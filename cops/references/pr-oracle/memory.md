# Memory directory

The git checkout is `${CLAUDE_CONFIG_DIR:-~/.claude}/agent-memory/`; with `PR_MEMORY_REPO` set, it is the memory repository the hooks sync. All oracle memory lives under `memory/` on both hosts:

```text
memory/
  users/<github-login>/
    MEMORY.md
    candidates.md
  team/
    MEMORY.md
```

Those three files are all you write under `memory/`, each created with its first entry. Memory holds only rules that apply in every repository: no file or entry names a repository or links to one of its PRs. Whenever a call writes memory, also delete every other file in `memory/users/<github-login>/`, and rewrite or drop any entry naming a repository in the personal files and team file under `learning.md`. That cleanup is the one team-file write that needs no `record-team:` line.

`<github-login>` is the authenticated GitHub login passed by the caller, otherwise the result of `get_me`; never use `git config user.name` or the machine username. If lookup fails, skip every personal write, still read `memory/team/MEMORY.md`, and use the shell's required `login unknown — personal memory not written` suffix.

`memory/users/<github-login>/` is the only personal tree you write; never write another person's `users/<login>/`. Append to `memory/team/MEMORY.md` only when the prompt contains `record-team: <one line>`, and write that line nowhere else. Format it under `learning.md` with `(stated by <github-login>)` evidence. If it is repository-only, return `promote: <line>` instead. If it contradicts a shared-convention contract, meaning any section not marked *Default*, or an existing team rule, return `conflict: <line> — contradicts <the rule and where it lives>` for the caller to settle.

Claude Code's `memory: user` path is `${CLAUDE_CONFIG_DIR:-~/.claude}/agent-memory/cops-pr-oracle/MEMORY.md` (`cops:pr-oracle`, with the colon written as a dash). Claude preloads its first 200 lines. It is a stub, not the rule store. Keep it exactly:

```markdown
# Index

Rules live under `memory/`, not in this file. Read `memory/users/<github-login>/MEMORY.md` and `memory/team/MEMORY.md`.
```

Cursor does not preload it. Nothing else belongs in `cops-pr-oracle/`. If the stub has extra content or other files sit beside it, move rules that hold in every repository into `memory/users/<github-login>/MEMORY.md` without duplicating existing entries, delete the rest, and restore the exact stub.

Before the active mode's job, read and apply only the first 200 lines of `memory/users/<github-login>/MEMORY.md` and `memory/team/MEMORY.md`. Read no other `memory/users/<login>/` tree. Another person's rules reach this agent only after someone records them for the team.

When `PR_MEMORY_REPO` is in the environment and `agent-memory/` is not yet a git checkout, run `"${CURSOR_PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/memory-sync.sh" pull` before reading, if either plugin-root variable is set. If it says it could not reach the memory repository and asks for attachment, do not try to attach anything; use the shell's exact memory-sync suffix. The repository is often configured as a Claude Code plugin option or Cursor plugin variable exposed only to session hooks; the session-start hook has then already pulled, so there is nothing to run. Never push; the session hook does.
