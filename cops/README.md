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
3. **Memory — nothing to do on one machine.** The oracle keeps active rules and inactive candidates in `${XDG_DATA_HOME:-$HOME/.local/share}/cops-memory` by default. A direct rule is remembered only when you explicitly ask; reviewer feedback stays inactive until you explicitly promote it. To change the directory or share memory across machines, cloud sessions, or a team, see [Syncing the oracle's memory](#syncing-the-oracles-memory).
4. **Check it.** Run a skill, e.g. `/cops:pr-review <PR URL>`. Its report
   ends with a `Handoffs:` list. `✓` on each line means the agents ran;
   `inline (…)` means one wasn't available and the skill did that step
   itself.

The agents need no setup of their own: installing `cops` makes them
available, and the skills call them.

## Agents

- [`agents/pr-oracle.md`](agents/pr-oracle.md) — briefs and checks without editing code or PRs. Its six modes lazy-load only their dependencies: active-memory modes load `memory.md`, GitHub modes load `github-access.md`, and only `learn-feedback` loads `learning.md` or writes memory.
  - **Memory:** the dedicated root is `${PR_MEMORY_DIR:-${CLAUDE_PLUGIN_OPTION_MEMORY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cops-memory}}`. Personal active rules are in `memory/users/<github-login>/MEMORY.md`, reviewer-derived inactive candidates in `candidates.md`, and explicitly shared rules in `memory/team/MEMORY.md`.
  - **Consent:** operational modes may suggest `memory-candidate:` but never persist it. Skills call `learn-feedback` separately only after explicit user intent. Direct user rules may become active immediately; reviewer candidates require explicit promotion; team writes require `record-team:`.
  - **One-repo rules aren't remembered.** The oracle suggests that repo's
    `CLAUDE.md` instead, so teammates and CI see it too.
  - **It only advises.** The skills still do every push, reply, and PR edit.
  - **Whole session with its memory:** `claude --agent cops:pr-oracle`.
  - **Cursor:** the same file is the `pr-oracle` subagent and uses the same dedicated root.
  - **Without `cops` installed,** the skills do each oracle step themselves
    ([`CONVENTIONS-orchestration.md`](CONVENTIONS-orchestration.md#companion-plugin-cops)).

- [`agents/pr-reviewer.md`](agents/pr-reviewer.md) — reads complete PR and repository evidence without writing GitHub or memory. Its `review-pr` mode returns substantial `Question:` / `Suggestion:` / `Issue:` / `Test:` drafts; `draft-author-notes` returns `Note:` / `Drive-by:` drafts and changes to remove instead. Both return structured YAML with the full head SHA and verified new-side anchors. If the named agent is unavailable, skills apply the same contract through a general read-only subagent or inline when no subagent tool exists.

- [`agents/pr-sidekick.md`](agents/pr-sidekick.md) — your sidekick in the
  field. The skills hand it loops that edit, run, commit, or push
  (implementing review threads, a chosen fix, a failing test, a
  rebase-and-draft), keeping them out
  of the main chat. It reads your remembered preferences from `memory/`
  (never writes them), follows the skill's prompt template, and returns a
  few lines. The calling skill
  picks its model per job — Haiku for mechanical edits, Sonnet for scoped
  changes, the main chat's model for anything needing more judgment. See
  [`CONVENTIONS-orchestration.md`](CONVENTIONS-orchestration.md#hand-long-loops-to-a-subagent).

### When the skills consult the oracle

- `pr-address` — `triage-threads` + `scout-repo` in one call (the unresolved
  threads, the rules each matches, and how to run tests), then
  `sweep-diff` on each batch. A subagent implements low-risk asks, up
  to 10 threads per batch, seeing only those threads, not the parent
  chat, so the edit/test loop stays cheap in a long session.
- `pr-sync` — `scout-repo` + `brief-task` in one call (changesets, the title
  prefix, the PR template, and how to write the description), handed to
  the subagent that rebases and drafts, then `grill-description` on the
  draft before applying it (flagging claims the diff doesn't back without
  writing memory).
- `pr-review` — `brief-task` gives `pr-reviewer` applicable active memory; the reviewer scouts the repository, reads the complete PR and outside-diff context, verifies anchors, and returns a draft for user confirmation before the skill posts one review.
- `pr-note` — `brief-task` on the user's own
  PR, before anyone else has commented, so the `Note:` comments it posts
  (no draft to confirm) give the reason for choices that follow a
  remembered rule, and `Drive-by:` comments say why an off-task change is
  in the PR. `pr-reviewer` drafts the notes and identifies unexplained drive-bys to remove; the skill posts at most one review. `pr-sync` and
  `oss:issue-fix` suggest it on a PR that has none yet. `pr-address` leaves both alone, and `pr-review` won't ask a
  `Question:` one of them already answers.
- `oss:issue-analyze` — `scout-repo` in a monorepo, for the package map
  its code survey starts from.
- `oss:issue-create` — `scout-repo` for the issue template.
- `oss:issue-verify` — `scout-repo` for the issue template, and for
  where tests live and how to run them.
- `oss:issue-fix` — `scout-repo` before running the failing test,
  `brief-task` once a fix option is picked, then `sweep-diff` on the fix a
  subagent commits.
- **Any other coding task** ("implement this feature", "implement PR for
  #123") — no skill runs, so the oracle's own description asks the main
  chat to call it: `scout-repo` + `brief-task` before writing code, then
  `sweep-diff` before committing or pushing. This is the model's call, so a
  small change may skip it; for a guarantee, add the same line to your
  `~/.claude/CLAUDE.md`. Shared convention rules (title prefix, non-closing
  issue references) and the `pr-note` suggestion only come with the skills.

### Syncing the oracle's memory

The dedicated root is `${PR_MEMORY_DIR:-${CLAUDE_PLUGIN_OPTION_MEMORY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cops-memory}}`; direct local memory works there without a sync repository. Cursor and Claude Code use the same root. Optional hooks ([`hooks/hooks.json`](hooks/hooks.json) → [`hooks/memory-sync.sh`](hooks/memory-sync.sh) on Claude Code; [`hooks/cursor-hooks.json`](hooks/cursor-hooks.json) → [`hooks/cursor-memory-sync.sh`](hooks/cursor-memory-sync.sh) on Cursor) sync only `memory/users/<github-login>/` and `memory/team/`: pull `main` and your branch at session start, then commit and push at turn and session end. A turn with no memory changes makes no network call.

1. Create a repo the team can push to, e.g. `<you>/agent-memory`. It can stay private. Oracle files committed there live under `memory/`.
2. Point the plugin at it (`owner/repo` for GitHub over HTTPS, or a full
   git URL), and give it your GitHub login — what you learn is pushed to
   `memory/<login>`:
   - **Locally, Claude Code** — the `cops` plugin's **PR memory repo** and
     **GitHub login** options, asked for when you enable the plugin (or in
     `/plugin` → `cops` → Configure). The `PR_MEMORY_REPO`, `PR_MEMORY_LOGIN`, and optional `PR_MEMORY_DIR` environment variables work too and win over options. Your git credentials need push access to the repo.
   - **Locally, Cursor** — the `PR_MEMORY_REPO`, `PR_MEMORY_LOGIN`, and optional `PR_MEMORY_DIR` plugin variables (Plugins → Configure) or the same names in the hooks' environment. Git credentials need push access to the repo.
   - **Claude Code on the web** — add `PR_MEMORY_REPO`, `PR_MEMORY_LOGIN`, and optionally `PR_MEMORY_DIR` to the cloud environment's environment variables, and make sure the Claude GitHub
     App can access the repo (github.com/settings/installations → the
     Claude app → Repository access). A cloud session reaches a repo only
     once it's attached. You can add the memory repo in the repository
     selector when starting a session, but needn't: when the startup pull
     can't reach it, the hook asks Claude (via the `SessionStart` context)
     to attach the repo and pull again. If that fails, the next push picks
     the repo up once attached, keeping anything learned meanwhile.

How it behaves:

- **Opt-in and never blocking.** No memory repo set → the hooks do nothing. A
  failed push is reported on stderr and retried on the next push. A repo
  that can't be cloned is retried at most every 10 minutes, and once more
  when the session ends — not on every turn. Neither ever stops the session.
- **A branch per person, merged by you.** What someone's sessions learn is
  pushed to `memory/<github-login>`, never to `main`, so it can be
  reviewed and merged as a PR. Sessions pull `main` and their own branch,
  so a person's unmerged memory follows them across machines and reaches
  everyone once merged. The branch is only merged into, never rewritten.
  Neither a turn with nothing new nor bringing in a newer `main` pushes
  anything. The login is the one you set — the hooks never
  read a token or `gh` to look it up — else the one person with a
  `memory/users/` tree in the checkout. Neither → memory stays local,
  with a warning.
- **Existing memory is kept.** The first sync carries allowlisted local dedicated memory into the repo, merges exact missing lines, and backs up the old dedicated root. A one-time legacy import copies only the current login's user tree and the team tree from `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-memory/memory`. It also converts non-boilerplate, safe line-oriented text from legacy `agent-memory/cops-pr-oracle/MEMORY.md` into that user's inactive `candidates.md`, retaining source provenance rather than activating it. Sources are preserved and backed up; the completion marker is written only after content is actually imported.
- **Concurrent edits merge.** Two machines changing the same entry keep
  both lines (git's `union` merge) instead of stopping on a conflict; the
  oracle merges the duplicate on its next write.
- **It syncs only oracle memory.** Staging is restricted to `memory/users/<github-login>/` and `memory/team/`; unrelated agent data and plugin files are never staged.
