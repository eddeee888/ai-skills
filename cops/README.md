# Code Ops (`cops`)

Plugin for Claude Code and Cursor — skills for the PR lifecycle: reviewing, describing, syncing, and more.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/cops:<skill-name>` once this plugin is installed, e.g. `/cops:pr-sync`
(`/pr-sync` in Cursor).

## Setup

1. **Install the plugin** — `/plugin install cops` (see the
   [root README](../README.md#install)). Install `oss` too for the issue
   skills; they use this plugin's agents when it's there.
2. **Connect GitHub.** The skills use `gh` when it's logged in, and the
   GitHub MCP server otherwise. The `pr-oracle` agent reads GitHub only
   through the GitHub MCP server, so connect it even if you have `gh`.
3. **Memory — nothing to do on one machine.** The oracle keeps it in
   `~/.claude/agent-memory/`. It starts empty and learns as you go: tell a
   skill what you want ("always add a test for a fixed bug", "keep the Why
   to one sentence") and it's remembered for every repo. To share it across
   machines, cloud sessions, or a team, see
   [Syncing the oracle's memory](#syncing-the-oracles-memory).
4. **Check it.** Run a skill, e.g. `/cops:pr-review <PR URL>`. Its report
   ends with a `Handoffs:` list. `✓` on each line means the agents ran;
   `inline (…)` means one wasn't available and the skill did that step
   itself.

The agents need no setup of their own: installing `cops` makes them
available, and the skills call them.

## Agents

- [`agents/pr-oracle.md`](agents/pr-oracle.md) — remembers, briefs, and
  checks, but never edits code or a PR. It holds your review themes and preferences
  (rules that apply in every repo) and profiles a repo's setup (test
  runner, monorepo layout, changesets, PR/issue templates, contribution
  rules) on each call.
  - **Memory:** `memory: user`, in the checkout at `~/.claude/agent-memory/`.
    Every oracle file lives under `memory/`: `memory/users/<github-login>/`
    for one person's rules, `memory/team/` for rules someone explicitly
    asked to share (a skill passes `record-team:`). The GitHub login is the
    one the calling skill passes, or the GitHub MCP `get_me` tool's. Claude
    Code preloads `cops-pr-oracle/MEMORY.md`, only a stub pointing at
    `memory/`.
  - **One-repo rules aren't remembered.** The oracle suggests that repo's
    `CLAUDE.md` instead, so teammates and CI see it too.
  - **It only advises.** The skills still do every push, reply, and PR edit.
  - **Whole session with its memory:** `claude --agent cops:pr-oracle`.
  - **Cursor:** the same file is the `pr-oracle` subagent; it reads and
    writes `memory/` itself.
  - **Without `cops` installed,** the skills do each oracle step themselves
    ([`CONVENTIONS.md`](CONVENTIONS.md#companion-plugin-cops)).

- [`agents/pr-sidekick.md`](agents/pr-sidekick.md) — your sidekick in the
  field. The skills hand it loops that edit, run, commit, or push
  (implementing review threads, a chosen fix, a failing test, a
  rebase-and-draft), keeping them out of the main chat. It reads your
  remembered preferences from `memory/` (never writes them), follows the
  skill's prompt template, and returns a few lines. The calling skill
  picks its model per job — Haiku for mechanical edits, Sonnet for scoped
  changes, the main chat's model for anything needing more judgment. See
  [`CONVENTIONS.md`](CONVENTIONS.md#hand-long-loops-to-a-subagent).

### When the skills consult the oracle

- `pr-address` — `triage-threads` + `scout-repo` in one call (the unresolved
  threads, the rules each matches, and how to run tests), then
  `sweep-diff` on each batch. A subagent implements low-risk asks, up
  to 10 threads per batch, seeing only those threads, not the parent
  chat, so the edit/test loop stays cheap in a long session.
- `pr-sync` — `scout-repo` + `brief-task` in one call (changesets, the title
  prefix, the PR template, and how to write the description), handed to
  the subagent that rebases and drafts, then `grill-description` on the
  draft before applying it (flagging claims the diff doesn't back, and
  learning any description preference you stated).
- `pr-review` — `scout-repo` + `sweep-diff` in one call on the PR's diff,
  so the drafted `Question:` / `Suggestion:` / `Issue:` / `Test:` comments
  reflect rules you've asked for before. A subagent first checks code
  outside the diff, so no `Question:` asks what the code already answers.
- `pr-note` — `scout-repo` + `brief-task` in one call on the user's own
  PR, before anyone else has commented, so the `Note:` comments it posts
  (no draft to confirm) give the reason for choices that follow a
  remembered rule, and `Drive-by:` comments say why an off-task change is
  in the PR. `pr-sync` and `oss:issue-fix` suggest it on a PR that has
  none yet. `pr-address` leaves both alone, and `pr-review` won't ask a
  `Question:` one of them already answers.
- `oss:issue-analyze` — `scout-repo` in a monorepo, for the package map
  its code survey starts from.
- `oss:issue-create` — `scout-repo` for the issue template.
- `oss:issue-verify` — `scout-repo` for the issue template, and for
  where tests live and how to run them.
- `oss:issue-fix` — `scout-repo` before running the failing test,
  `brief-task` once a fix option is picked, then `sweep-diff` on the fix a
  subagent commits.

### Syncing the oracle's memory

The checkout is `~/.claude/agent-memory/`, oracle rules under its `memory/` (`memory/users/<github-login>/` and `memory/team/`). Without sync it stays on one machine — and a cloud session's container, memory included, is discarded when the session ends. Cursor's subagent uses the same directory, so one sync covers both hosts. The plugin ships hooks ([`hooks/hooks.json`](hooks/hooks.json) → [`hooks/memory-sync.sh`](hooks/memory-sync.sh) on Claude Code; [`hooks/cursor-hooks.json`](hooks/cursor-hooks.json) → [`hooks/cursor-memory-sync.sh`](hooks/cursor-memory-sync.sh) on Cursor) that sync it with a git repo the team can push to: pull `main` and your own branch at session start, commit and push at each turn end and at session end. A turn that learned nothing makes no network call.

1. Create a repo the team can push to, e.g. `<you>/agent-memory`. It can stay private. Oracle files committed there live under `memory/`.
2. Set `PR_MEMORY_REPO` to it (`owner/repo` for GitHub over HTTPS,
   or a full git URL):
   - **Locally, Claude Code** — in `~/.claude/settings.json`:
     `"env": { "PR_MEMORY_REPO": "<you>/agent-memory" }`. Your git
     credentials need push access to the repo.
   - **Locally, Cursor** — the same variable, as the `cops` plugin variable
     (Plugins → Configure) or in the hooks' environment. Git credentials
     need push access to the repo.
   - **Claude Code on the web** — add the same variable to the cloud
     environment's environment variables, and make sure the Claude GitHub
     App can access the repo (github.com/settings/installations → the
     Claude app → Repository access). A cloud session reaches a repo only
     once it's attached. You can add the memory repo in the repository
     selector when starting a session, but needn't: when the startup pull
     can't reach it, the hook asks Claude (via the `SessionStart` context)
     to attach the repo and pull again. If that fails, the next push picks
     the repo up once attached, keeping anything learned meanwhile.

How it behaves:

- **Opt-in and never blocking.** Unset variable → the hooks do nothing. A
  failed push is reported on stderr and retried on the next push. A repo
  that can't be cloned is retried at most every 10 minutes, and once more
  when the session ends — not on every turn. Neither ever stops the session.
- **A branch per person, merged by you.** What someone's sessions learn is
  pushed to `memory/<github-login>`, never to `main`, so it can be
  reviewed and merged as a PR. Sessions pull `main` and their own branch,
  so a person's unmerged memory follows them across machines and reaches
  everyone once merged. The branch is only merged into, never rewritten.
  Neither a turn with nothing new nor bringing in a newer `main` pushes
  anything. The login comes from `gh api user`, else the
  GitHub API with `GH_TOKEN`/`GITHUB_TOKEN` (or a proxy that
  authenticates, as in Claude Code on the web), else the one person with a
  `memory/users/` tree in the checkout. None works → memory stays local,
  with a warning.
- **Existing memory is kept.** The first sync on a machine carries local
  memory into the repo — new files as is, and lines missing from the repo's
  copy of a shared file appended to it — and backs up the old directory to
  `agent-memory.bak-<timestamp>`.
- **Concurrent edits merge.** Two machines changing the same entry keep
  both lines (git's `union` merge) instead of stopping on a conflict; the
  oracle merges the duplicate on its next write.
- **It syncs the whole `agent-memory/` directory,** so any other agent you
  give `memory: user` is carried along too.
