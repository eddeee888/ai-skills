# pr

Claude Code plugin — skills for working with pull requests: reviewing,
describing, syncing, or otherwise assisting with the PR lifecycle.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/pr:<skill-name>` once this plugin is installed, e.g. `/pr:pr-sync`.

Add each skill as its own directory here, e.g. `skills/<skill-name>/SKILL.md`.

## Agents

- [`agents/pr-sidekick.md`](agents/pr-sidekick.md) — your PR sidekick, with
  persistent memory (`memory: user`, stored under
  `~/.claude/agent-memory/`) of the review themes and
  preferences you keep coming back to. The skills consult it at fixed points:
  - `pr-address` — `classify` the unresolved threads, then `brief` before
    implementing a thread's ask and `check-diff` before pushing it.
  - `pr-sync` — `brief` before drafting the description, and
    `check-description` on the draft before applying it (flagging claims the
    diff doesn't back up, and learning from your edits to past drafts).
  - `oss:issue-fix` — `brief` and `check-diff` around the fix.

  It only advises: the skills still do every push, reply, and PR edit.
  Memory lives on your machine only; when a rule has clearly settled, the
  sidekick suggests moving it into the repo's `CLAUDE.md` so teammates get
  it too. To code with its memory loaded for a whole session, run
  `claude --agent pr:pr-sidekick`.

  Claude Code only — the skills fall back to doing each step themselves
  when the agent isn't available (e.g. in Cursor). See
  [`CONVENTIONS.md`](../CONVENTIONS.md#consulting-the-prpr-sidekick-agent).
