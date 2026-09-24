# pr

Plugin for Claude Code and Cursor — skills for working with pull requests: reviewing, describing, syncing, or otherwise assisting with the PR lifecycle.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/pr:<skill-name>` once this plugin is installed, e.g. `/pr:pr-sync`.

Add each skill as its own directory here, e.g. `skills/<skill-name>/SKILL.md`.

## Agents

- [`agents/pr-sidekick.md`](agents/pr-sidekick.md) — your PR sidekick, with
  persistent memory (`memory: user`) of the review themes and
  preferences you keep coming back to. In the memory checkout
  (`~/.claude/agent-memory/`, the repo `PR_SIDEKICK_MEMORY_REPO` points at
  when sync is on) every sidekick file lives under `memory/`:
  `memory/users/<github-login>/` for that person's rules, profile cache,
  and drafts, and `memory/team/` for rules someone explicitly asked to
  share. The GitHub login comes from `gh api user --jq .login`. It also keeps a cached `profile` of
  each repo you work in (test runner, monorepo layout, changesets, PR/issue
  templates, contribution rules), refreshed only when the files behind it
  change. The skills consult it at fixed points:
  - `pr-address` — `classify` the unresolved threads (with the remembered
    rules each one matches), then `check-diff` on each batch. Low-risk
    asks are implemented by a subagent, up to 10 threads per batch, that
    sees only those threads, not the parent chat, so the edit/test loop
    stays cheap in a long session.
  - `pr-sync` — `profile` + `brief` in one call (changesets, the title
    prefix, the PR template, and how to write the description), handed to
    the subagent that rebases and drafts, and
    `check-description` on the draft before applying it (flagging claims the
    diff doesn't back up, and learning from your edits to past drafts).
  - `oss:issue-create` / `oss:issue-verify` — `profile` for the issue
    template, and for where tests live and how to run them.
  - `oss:issue-fix` — `profile` + `brief` in one call, then `check-diff`
    on the fix a subagent commits.

  It only advises: the skills still do every push, reply, and PR edit.
  Personal files stay in that person's `memory/users/<github-login>/` tree.
  `memory/team/MEMORY.md` grows only when a skill passes `record-team:`
  because the user explicitly asked to share a rule (`CONVENTIONS.md`).
  When a rule has clearly settled, the sidekick suggests moving it into
  the product repo's `CLAUDE.md` so teammates and CI see it too. To code
  with its memory loaded for a whole session, run
  `claude --agent pr:pr-sidekick`. In Cursor the same file is the
  `pr-sidekick` subagent — the skills delegate to it, and it reads and
  writes `memory/` itself. Claude Code preloads
  `pr-pr-sidekick/MEMORY.md`, which is only a stub pointing at `memory/`.

  Memory sync across machines and cloud sessions is opt-in; see below.

  The `pr` plugin has to be installed for the agent to exist. Without it,
  the skills do each step themselves. See
  [`CONVENTIONS.md`](../CONVENTIONS.md#consulting-the-pr-sidekick-agent).

### Syncing the sidekick's memory

The checkout is `~/.claude/agent-memory/`. Sidekick rules, profiles, and drafts are under `memory/` in that directory (`memory/users/<github-login>/` and `memory/team/`). Without sync it stays on one machine — and a cloud session's container, and its memory, is thrown away when the session ends. The same directory is what Cursor's subagent reads and writes, so one sync covers both hosts. The plugin ships hooks ([`hooks/hooks.json`](hooks/hooks.json) → [`hooks/memory-sync.sh`](hooks/memory-sync.sh) on Claude Code; [`hooks/cursor-hooks.json`](hooks/cursor-hooks.json) → [`hooks/cursor-memory-sync.sh`](hooks/cursor-memory-sync.sh) on Cursor) that sync that directory with a git repo the team can push to: pull when a session starts, commit and push when it stops.

1. Create a repo the team can push to, e.g. `<you>/agent-memory`. It can stay private. Sidekick files committed there live under `memory/`.
2. Set `PR_SIDEKICK_MEMORY_REPO` to it (`owner/repo` for GitHub over HTTPS,
   or a full git URL):
   - **Locally, Claude Code** — in `~/.claude/settings.json`:
     `"env": { "PR_SIDEKICK_MEMORY_REPO": "<you>/agent-memory" }`. Your git
     credentials need push access to the repo.
   - **Locally, Cursor** — the same variable, as the `pr` plugin variable
     (Plugins → Configure) or in the environment the hooks run with. Git
     credentials need push access to the repo.
   - **Claude Code on the web** — add the same variable to the cloud
     environment's environment variables, and make sure the Claude GitHub
     App can access the repo (github.com/settings/installations → the
     Claude app → Repository access). A cloud session can only reach a repo
     once it's attached to it. You can add the memory repo in the repository
     selector when starting a session, but you don't have to: when the
     startup pull can't reach it, the hook asks Claude (through the
     `SessionStart` context) to attach the repo itself and pull again. If
     that fails, the next push still picks the repo up once it's attached,
     keeping anything learned in the meantime.

How it behaves:

- **Opt-in and never blocking.** Unset variable → the hooks do nothing. An
  unreachable repo or failed push is reported on stderr and retried on the
  next push; it never stops the session.
- **Existing memory is kept.** The first sync on a machine carries local
  memory into the repo — new files as is, and lines missing from the repo's
  copy of a shared file appended to it — and backs up the old directory to
  `agent-memory.bak-<timestamp>`.
- **Concurrent edits merge.** Two machines changing the same entry keep
  both lines (git's `union` merge) instead of stopping on a conflict; the
  sidekick merges the duplicate on its next write.
- **It syncs the whole `agent-memory/` directory,** so any other agent you
  give `memory: user` is carried along too.
