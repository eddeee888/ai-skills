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
3. **Attach memory when wanted.** Keep memory in its own Git repository, configure its workspace path, and attach it as described in [Workspace memory](#workspace-memory). With no valid path, COPS runs without memory and never creates a machine-local store. A direct rule is remembered only when you explicitly ask; reviewer feedback stays inactive until you explicitly promote it.
4. **Check it.** Run a skill, e.g. `/cops:pr-review <PR URL>`. Its report
   ends with a `Handoffs:` list. `✓` on each line means the agents ran;
   `inline (…)` means one wasn't available and the skill did that step
   itself.

The agents need no setup of their own: installing `cops` makes them
available, and the skills call them.

## Agents

- [`agents/pr-oracle.md`](agents/pr-oracle.md) — briefs, checks, reviews, and drafts author notes without editing code or GitHub. Its eight modes lazy-load only their dependencies: active-memory modes load `memory.md`, operational GitHub modes load `github-access.md`, review modes load `review-evidence.md`, and only `learn-feedback` loads `learning.md` or writes memory.
  - **Memory:** a session-start hook resolves the configured path, verifies it is a Git root, and passes it and the configured `PR_MEMORY_LOGIN` into agent calls. Personal active rules are in `memory/users/<PR_MEMORY_LOGIN>/MEMORY.md`, reviewer-derived inactive candidates in `candidates.md`, and explicitly shared rules in `memory/team/MEMORY.md`.
  - **Consent:** operational modes may suggest `memory-candidate:` but never persist it. Skills call `learn-feedback` separately only after explicit user intent. Direct user rules may become active immediately; reviewer candidates require explicit promotion; team writes require `record-team:`.
  - **One-repo rules aren't remembered.** The oracle suggests that repo's
    `CLAUDE.md` instead, so teammates and CI see it too.
  - **It only advises.** The skills still do every push, reply, and PR edit.
  - **Whole session with its memory:** `claude --agent cops:pr-oracle`.
  - **Cursor:** the same file is the `pr-oracle` subagent and uses the same attached repository.
  - **Without `cops` installed,** the skills do each oracle step themselves
    ([`CONVENTIONS-orchestration.md`](CONVENTIONS-orchestration.md#companion-plugin-cops)).

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
- `pr-review` — `review-pr` applies active memory, scouts the repository, reads complete PR and outside-diff context, verifies anchors, and returns structured `Question:` / `Suggestion:` / `Issue:` / `Test:` drafts for confirmation before the skill posts one review.
- `pr-note` — `draft-author-notes` runs on the user's own PR before anyone else has commented. It applies active memory, drafts `Note:` / `Drive-by:` comments, and identifies unexplained drive-bys to remove; the skill shows the draft and posts at most one review once you confirm. `pr-sync` and
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

### Workspace memory

COPS never creates or synchronizes a machine-local memory store. Memory is optional and must be a Git repository already attached to the current workspace.

1. Create a memory Git repository and store oracle files under `memory/users/<github-login>/` and `memory/team/`.
2. Clone or attach that repository using the host's normal workspace controls.
3. Configure its workspace path and your GitHub login:
   - **Claude Code:** plugin options `memory_path` and `memory_login`, or environment variables `PR_MEMORY_PATH` and `PR_MEMORY_LOGIN`.
   - **Cursor:** plugin variables `PR_MEMORY_PATH` and `PR_MEMORY_LOGIN`.
   - `PR_MEMORY_LOGIN` names your personal tree, `memory/users/<login>/`. COPS never guesses it from `gh`, the GitHub MCP server, Git, or the folders already in the repo. Unset → team memory only; nothing personal is read or written.
   - Use an absolute path locally. In a cloud workspace where attached repositories are checked out directly under the home directory, use a portable home-relative path such as `~/agent-memory`.

   ```text
   # Local workspace
   PR_MEMORY_PATH=/path/to/agent-memory
   PR_MEMORY_LOGIN=<your-github-login>

   # Cloud workspace
   PR_MEMORY_PATH=~/agent-memory
   PR_MEMORY_LOGIN=<your-github-login>
   ```

4. Use normal Git review, commit, pull, and push operations in that repository. COPS does none of them automatically.

The session-start hook trusts the configured location, expands `~/` or `$HOME/`, verifies that it is a Git root, checks that `PR_MEMORY_LOGIN` looks like a GitHub login, and injects both into context. It does not parse workspace metadata or modify Git or memory.

If the path is missing or not a Git root, operational modes continue without memory and `learn-feedback` performs no write. COPS never falls back to `~/.claude`, `$XDG_DATA_HOME`, or another hidden directory.

When upgrading from local or hook-managed memory, copy only your `memory/users/<github-login>/` tree and the shared `memory/team/` tree into the attached repository, review the diff, and commit it normally. COPS does not migrate or publish those files automatically.
