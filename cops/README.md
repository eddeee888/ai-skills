# Code Ops (`cops`)

Plugin for Claude Code and Cursor — skills for the PR lifecycle: starting, reviewing, describing, syncing, and more.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/cops:<skill-name>` once this plugin is installed, e.g. `/cops:pr-sync`
(`/pr-sync` in Cursor).

Which skill fits depends on whose PR it is and where it is in review. In lifecycle order:

| When | Skill | What it does |
| --- | --- | --- |
| You have a task, no PR yet | [`pr-start`](skills/pr-start/SKILL.md) | Turns a confirmed task card into a pushed draft PR (slash-only). |
| Your PR, before anyone comments | [`pr-note`](skills/pr-note/SKILL.md) | Leaves `Note:` / `Drive-by:` reasoning on your own PR. |
| Someone else's PR | [`pr-review`](skills/pr-review/SKILL.md) | Drafts labeled comments and posts one confirmed `COMMENT` review. |
| Your PR, reviewers have commented | [`pr-address`](skills/pr-address/SKILL.md) | Addresses unresolved review threads on your PR. |
| Your PR, branch moved on | [`pr-sync`](skills/pr-sync/SKILL.md) | Rebases the PR and refreshes its title, description, and changeset. |

The [COPS HQ pane](#cops-hq-pane) works out the same thing from the PR: its `Next:` line names the skill, and its Activity section lists what ran this session.

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

## Status line

In Claude Code, `cops` adds a status line entry that shows the memory state and how full each `MEMORY.md` is, for example (Claude Code labels the entry `cops`):

```text
memory: octocat (12/200,40/200)
```

- **State:** `memory: <login>`, `memory: ✗ (no login)`, `memory: ✗ (off)` (no path configured), or `memory: ✗ (bad path)` (the path isn't a Git root). It comes from the same script as the session-start hook, so the two always agree.
- **Capacity:** `(<personal>/200,<team>/200)`, the lines in your personal and the team `MEMORY.md` out of the 200 that `pr-oracle` reads. A missing file counts as 0. A toast warns once per session when either file reaches 180 lines.

It refreshes at session start and every two minutes.

## Rule band

In Claude Code, when you type a prompt with a rule-like sentence — one that opens with "from now on", "always", "never", "don't ever", or "stop doing" — `cops` shows that sentence in a band above the prompt with three buttons:

- **Remember personally** puts `Remember this rule: <sentence>` in the prompt box.
- **Record for team** puts `record-team: <sentence>` in the prompt box.
- **Dismiss** clears the offer.

You edit and send the filled prompt yourself; the band never writes memory or calls `learn-feedback`. It stays quiet for prompts that already say "remember" or `record-team:`, slash commands, prompts that didn't come from you (a plugin's, a scheduled task's), and sessions where memory is off.

## COPS HQ pane

In Claude Code, a pane with two sections and a `Next:` line, and a third section while the memory inbox holds lines, opens by itself when a review thread needs you or a `cops` agent starts. Close it and it stays closed for the session; `/cops-hq` opens it again, even while Claude is working. In a terminal narrower than 144 columns, a pane that opens by itself waits until the terminal widens; `/cops-hq` shows it at any width.

- **Threads:** the open review threads on the current branch's PR, grouped by whose move it is. The `PR #<n>` heading links to the PR, and each thread's `path:line` links to its last comment. **Needs you** means a reviewer commented last; **waiting on reviewer** means the PR author did. Outdated threads are marked. Press `[ ]` beside a thread to mark it handled locally; the marks clear after the next successful `git push`. Resolved threads are left out, and so are your own `Note:` / `Drive-by:` threads once you 👍 them (they return if someone replies). It needs `gh` logged in; without it, the section says so.
- **Next:** the cops skill that fits the branch's PR right now, with why, and a **Use** button that puts it in the prompt box. `/cops:pr-start` on a branch without a PR, `/cops:pr-review` on someone else's PR, and on your own `/cops:pr-address` while threads need you (threads marked handled don't count), or `/cops:pr-note` before anyone has reviewed it or you've left notes. Otherwise it's left out, as it is when `gh` can't say who you are. `pr-sync` is never suggested: whether a description is stale isn't something the pane can see. When that skill already ran this session, the line says which run (`ran as #2`).
- **Activity:** every skill that ran this session, cops or not, with the cops agent calls each one made nested under it, so you can cross-check what ran against the `Next:` line:

  ```text
  Activity · 2 skills · 3 agents
  #1 /cops:pr-review https://github.com/o/r/pull/7 · you · 3m ago
     ✓ 🔮 Oracle · review-pr · 40s · 30k tokens · 4 findings
  #2 /cops:pr-address · model · just now
     ✓ 🔮 Oracle · triage-threads + scout-repo · 20s · 12k tokens · …
     ⠋ 🦸 Sidekick · 6 rules
  ```

  - Skill rows are numbered in order, with their arguments, who started them, and when: `you` typed the slash command, `model` means Claude called it, and `preloaded` means it came another way, such as a subagent's preloaded skill.
  - An agent call sits under the latest skill that started before it; calls made before any skill come first, unindented. Each `cops:pr-oracle` (🔮 Oracle) and `cops:pr-sidekick` (🦸 Sidekick) call shows what it was given and what it returned:
    - Oracle: its mode;
    - Sidekick: how many rules its `Rules that apply:` line carried and how many deviations it reported (`6 rules · 1 deviation`), and a red warning if its prompt carried `memory-root`, which it must never get;
    - for both: the outcome (`CHECKPOINT_FOUND <sha>`, `CHECKPOINT_NOT_FOUND`, `pushed <sha>`, `committed <sha>`, a findings count, or the first line), the time taken, and the tokens used. Each row starts with its status: a spinner while the call runs, `✓` when it's done, `✗` when it failed. Background calls show as running in the background.
- **Inbox:** while memory is on, the `memory-candidate:`, `promote:`, `conflict:` and `open:` lines cops agents return, each once, with the repository and PR they came from (e.g. `· ai-skills#59`). `open:` lines stay for the session; the rest are kept across sessions. **Park as candidate** (a `triage-threads` candidate) or **Remember** (a `grill-description` one) puts the matching request in the prompt box and clears the line; **Drop** clears it, and the same line isn't collected again, even in later sessions. It never writes memory.

The threads refresh at session start, after Bash commands that switch, commit, push, or pull branches or run `gh pr`, and every two minutes. No model is called; the grouping comes from who commented last.

All three live in one hooks module, [`hooks/cops.tsx`](hooks/cops.tsx). What they say is worked out in [`hooks/status-line.ts`](hooks/status-line.ts), [`hooks/pr-panel.ts`](hooks/pr-panel.ts), [`hooks/memory-inbox.ts`](hooks/memory-inbox.ts) and [`hooks/rule-band.ts`](hooks/rule-band.ts). Cursor doesn't load the module.

## Agents

- [`agents/pr-oracle.md`](agents/pr-oracle.md) — briefs, checks, reviews, and drafts author notes without editing code or GitHub. Its eight modes lazy-load only their dependencies: active-memory modes load `memory.md`, operational GitHub modes load `github-access.md`, review modes load `review-evidence.md`, and only `learn-feedback` loads `learning.md` or writes memory.
  - **Memory:** a session-start hook resolves the configured path, verifies it is a Git root, and passes it and the configured `PR_MEMORY_LOGIN` into oracle calls. The oracle is the only agent that reads memory. Personal active rules are in `memory/users/<PR_MEMORY_LOGIN>/MEMORY.md`, reviewer-derived inactive candidates in `candidates.md`, and explicitly shared rules in `memory/team/MEMORY.md`.
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
  of the main chat. It never reads or writes `memory/`: the oracle picks
  the remembered rules for each job and the skill puts them in its prompt.
  It follows that prompt template and returns a few lines. The calling skill
  picks its model per job — Haiku for mechanical edits, Sonnet for scoped
  changes, the main chat's model for anything needing more judgment. See
  [`CONVENTIONS-orchestration.md`](CONVENTIONS-orchestration.md#hand-long-loops-to-a-subagent).

### When the skills consult the oracle

- `pr-start` — `scout-repo` + `brief-task` in one call (how to run tests,
  the title prefix, the PR template, and the remembered rules for the
  sidekick) before you confirm the task card, then `sweep-diff` on the
  commits the fix loop makes, before anything is pushed or the draft PR
  opens.
- `pr-note` — `draft-author-notes` runs on the user's own PR before anyone else has commented. It applies active memory, drafts `Note:` / `Drive-by:` comments, and identifies unexplained drive-bys to remove; the skill shows the draft and posts at most one review once you confirm. `pr-sync` and
  `oss:issue-fix` suggest it on a PR that has none yet. `pr-address` leaves both alone, and `pr-review` won't ask a
  `Question:` one of them already answers.
- `pr-review` — `review-pr` applies active memory, scouts the repository, reads complete PR and outside-diff context, verifies anchors, and returns structured `Question:` / `Suggestion:` / `Issue:` / `Test:` drafts for confirmation before the skill posts one review.
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
- `oss:issue-analyze` — `scout-repo` in a monorepo, for the package map
  its code survey starts from.
- `oss:issue-create` — `scout-repo` for the issue template.
- `oss:issue-verify` — `scout-repo` for the issue template, and for
  where tests live and how to run them, then `brief-task` before a
  subagent writes the failing test.
- `oss:issue-fix` — `scout-repo` before running the failing test,
  `brief-task` once a fix option is picked, then `sweep-diff` on the fix a
  subagent commits.
- **Any other coding task** ("implement this feature", "implement PR for
  #123") — for a guaranteed path, run `/cops:pr-start`: it makes every
  oracle call above, confirms a task card with you, and opens a draft PR.
  Without it, the oracle's own description asks the main chat to call it:
  `scout-repo` + `brief-task` before writing code, then `sweep-diff` before
  committing or pushing. That is the model's call, so a small change may
  skip it; add the same line to your `~/.claude/CLAUDE.md` to make it
  stick. Shared convention rules (title prefix, non-closing issue
  references) and the `pr-note` suggestion only come with the skills.

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

If the path is unset, the session-start hook says so, and the first COPS call tells you memory is off. If the path is missing or not a Git root, operational modes continue without memory and `learn-feedback` performs no write. COPS never falls back to `~/.claude`, `$XDG_DATA_HOME`, or another hidden directory.

When upgrading from local or hook-managed memory, copy only your `memory/users/<github-login>/` tree and the shared `memory/team/` tree into the attached repository, review the diff, and commit it normally. COPS does not migrate or publish those files automatically.
