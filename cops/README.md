# Code Ops (`cops`)

Plugin for Claude Code and Cursor — skills for the PR lifecycle: starting, reviewing, describing, syncing, and more.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/cops:<skill-name>` once this plugin is installed, e.g. `/cops:pr-wrap-up`
(`/pr-wrap-up` in Cursor).

Which skill fits depends on whose PR it is and where it is in review. In lifecycle order:

| When | Skill | What it does |
| --- | --- | --- |
| You have a task, no PR yet | [`pr-start`](skills/pr-start/SKILL.md) | Turns a confirmed task card into a pushed draft PR (runs when you ask for a PR for a task; `--autopilot` only when you type it). The card carries a `Size:` line — Small, Medium or Large, with the reason — for you to see; it is advisory and gates nothing. A required `Evidence:` line names the before/after scenarios to show, from the oracle's brief ([`CONVENTIONS-evidence.md`](CONVENTIONS-evidence.md)); pr-start captures the before on the base, before the first edit, and `pr-wrap-up` the after on the final code; they are shown as `### Before` and `### After` in the PR body: text evidence inline, local-only, with `manual` commands for anything needing credentials or a shared environment, and screenshots dropped by you into the PR body. With `--autopilot`, or the autopilot choice the card offers, it goes on to a finished draft PR assigned to you: see [Autopilot](#autopilot). |
| Someone else's PR, or yours as a self-review | [`pr-review`](skills/pr-review/SKILL.md) | Drafts labeled comments and posts one confirmed `COMMENT` review. On your own PR, **Fix, no post** fixes the chosen findings and pushes instead of posting them. |
| Your PR, branch moved on | [`pr-wrap-up`](skills/pr-wrap-up/SKILL.md) | Rebases the PR and refreshes its title, description, and changeset, and captures its After evidence on the final code: missing or stale afters are captured with the repo's own tooling, local-only, or labelled `stale`, and screenshots go back to `pending: drop` for you. |
| Your PR, before anyone comments | [`pr-note`](skills/pr-note/SKILL.md) | Leaves `Note:` / `Drive-by:` reasoning on your own PR. Run it last, on the final diff. |
| Your PR, reviewers have commented | [`pr-address`](skills/pr-address/SKILL.md) | Addresses unresolved review threads on your PR. |

### Autopilot

`/cops:pr-start --autopilot <task>` carries one confirmed task card to a finished draft PR, assigned to you, without another prompt. Without the flag, the confirm screen offers it as a choice whenever the gate passes. The rules are in [`skills/pr-start/autopilot.md`](skills/pr-start/autopilot.md).

- **Consent:** the task card is the only prompt. It lists every outward action it authorises: push, open PR, post review, push fixes, edit title and body, post notes, assign you. Marking the PR ready stays yours.
- **Gate:** autopilot is not offered, and the normal run goes on, unless you have write access and the repo already has an `autopilot` label (the skill never creates it). Otherwise every card offers it, and the choice is yours: a Large size, a scope touching security or auth, data loss, infrastructure or a public API, or a Done when that is an observable behavior rather than a test or a command adds an advisory note to the line, such as `🤖 Autopilot: offered — advisory: Large`, and blocks nothing.
- **The run:** the fix loop and sweep as usual, then a draft PR with the `autopilot` label and a note box opening the body that says it was opened on autopilot, with an unticked `Approved by <you>` checkbox for you to tick once you've read it. Then four skills run in a fixed order, each as its own skill run: `pr-review` posts a self-review, `pr-address` handles its threads, `pr-wrap-up` rebases and refreshes the title and description, and `pr-note` posts notes on the final diff. Last, the PR is assigned to you and stays a draft; you mark it ready, with the pane's **Mark ready** button or `gh pr ready <number>`.
- **Self-review threads:** a `Question:` stays open for you; a `Suggestion:` is applied if low risk; a `Test:` adds the missing case; an `Issue:` is fixed test first if low risk, and stays open if critical. High-risk work is never automatic. Threads are never resolved, and a skipped one gets no reply.
- **Stops:** any failure or subagent question ends the run; nothing is asked mid-run. The PR stays a draft, is assigned to you, and the report names the stage reached.
- **Resume:** say "resume the rest with autopilot" (or type `/cops:pr-start --autopilot resume [<PR URL>]`) to continue a stopped run without another card; your own message is the consent. In the same conversation it picks up at the step that stopped. In a new one it resumes the chain on your open `autopilot`-labelled PR, skipping `pr-review` and `pr-note` when their signed posts exist; a run that stopped before the PR existed starts over with `/cops:pr-start`. A resume never opens a second PR. The rules are in [`skills/pr-start/resume.md`](skills/pr-start/resume.md).
- **Signatures:** autopilot posts carry the skill signature without `Approved:`, since you haven't seen the text.
- **Bot tokens:** where `gh api user` doesn't return a person, pass your login as `--autopilot <login>`; without it the card asks for one.

The [COPS HQ pane](#cops-hq-pane) works out the same thing from the PR: its `Next:` line names the skill, and its Activity section lists what ran this session.

## Setup

1. **Install the plugin** — `/plugin install cops` (see the
   [root README](../README.md#install)). Install `oss` too for the issue
   skills; they use this plugin's agents when it's there.
2. **Connect GitHub.** The skills use `gh api` when a REST read works,
   and the GitHub MCP server otherwise. The `pr-oracle` and `pr-sidekick`
   agents read GitHub only through `gh api`, so set up `gh` even if you
   connect the GitHub MCP server.
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
memory: octocat · self 12/200 · team 40/200 · 1 uncommitted · 2 unpushed
```

- **State:** `memory: <login>`, `memory: ✗ (no login)`, `memory: ✗ (off)` (no path configured), or `memory: ✗ (bad path)` (the path isn't a Git root). It comes from the same script as the session-start hook, so the two always agree.
- **Capacity:** `self <personal>/200 · team <team>/200`, the lines in your personal and the team `MEMORY.md` out of the 200 that `pr-oracle` reads. A missing file counts as 0. A toast warns once per session when either file reaches 180 lines.
- **Git:** `<n> uncommitted` and `<n> unpushed`, from `git status --porcelain` and `git rev-list --count @{u}..HEAD` in the memory repository; a zero count is left out, a branch with no upstream shows no unpushed part, and a failing git command drops only these parts. COPS never fetches, pulls, commits or pushes it. A toast at session end says when changes are uncommitted.

It refreshes at session start, every two minutes, and after a `learn-feedback` call.

## Rule band

In Claude Code, when you type a prompt with a rule-like sentence — one that opens with "from now on", "always", "never", "don't ever", or "stop doing" — `cops` shows that sentence in a band above the prompt with three buttons:

- **Remember personally** puts `Remember this rule: <sentence>` in the prompt box.
- **Record for team** puts `record-team: <sentence>` in the prompt box.
- **Dismiss** clears the offer.

You edit and send the filled prompt yourself; the band never writes memory or calls `learn-feedback`. It stays quiet for prompts that already say "remember" or `record-team:`, slash commands, prompts that didn't come from you (a plugin's, a scheduled task's), and sessions where memory is off.

## What the Claude Code mod does

The hooks module [`hooks/cops.tsx`](hooks/cops.tsx) draws the COPS HQ pane and the status line. It runs only in Claude Code.

- **Programs it starts.** Each runs through Claude Code's process API (`process.run`) with a 15-second limit, and a failure leaves the last view up. They all go through one helper in `hooks/cops.tsx`, so the commands are listed here in full rather than spelled out at the call; this is every program the mod runs, and none is built from what you type or from conversation text:
  - `git rev-parse --abbrev-ref HEAD` — tells whether the working directory is a git repository, for the Threads section.
  - `gh pr view --json number,url,state,isDraft` — finds the current branch's PR, for the Threads heading and the `Next:` line.
  - `gh api graphql -F owner={owner} -F name={repo} -F number=<n> -f query=<review-threads query>` — reads the PR's review threads, for the Threads section.
  - `gh pr ready <n>` — marks the current branch's PR ready for review, only when you press **Mark ready** on a finished autopilot card.
  - `git remote get-url origin` — names the repository (`ai-skills#59`) on lines collected into the memory inbox.
  - `bash <plugin>/hooks/memory-context.sh claude <memory_path> <memory_login>` — asks the plugin's own script whether memory is on and where its root is, for the status line, the Rules and Inbox sections, and the rule band.
  - `git --no-optional-locks -C <memory root> status --porcelain --untracked-files=all` — counts uncommitted changes in the memory repository, for the status line and the session-end toast.
  - `git -C <memory root> rev-list --count @{u}..HEAD` — counts unpushed commits there, for the status line.
- **What it sends out.** Only the three `gh` commands above reach the network, and they send only what reading the current PR and its review threads takes, plus the PR number when you press **Mark ready**, to GitHub's API. Your conversation and local data (prompts, agent calls, skill runs, memory files) stay on your machine and are read only to draw the pane and the status line; the `prompt.submit` hook reads what you type only to spot a rule you ask to remember, and that text is never put into a command's arguments. The git commands and `memory-context.sh` run locally; the memory repository is only read, never fetched, pulled, committed or pushed. The mod reads two kinds of local file (`fs.read`): the personal and team `MEMORY.md` under the memory root, to count and match remembered rules, and the plugin's own `plugin.json`, for the version on the Stats tab. Nothing it reads goes into a command's arguments, so none of it leaves through the process API (`process.run`).
- **Credentials.** It uses your existing `gh` login through the `gh` CLI. It reads and stores no token itself; without a `gh` login, the Threads section says so.
- **Its hooks.** It hooks `command.run`, `agent.spawn`, `tool.call`, `skill.prompt` and `prompt.submit`, among others (`session.start`, `session.end`, `turn.complete`, `ui.close` and `ui.render`). They record activity for the pane and pass each event on unchanged, with two exceptions: `/cops-hq`, the plugin's own command, is answered by the plugin (it opens the pane), and while a rule offer is pending the band above the prompt draws the plugin's "Remember …?" row. It never makes a permission decision: it never denies or allows a command, tool call, skill, agent or prompt. It keeps its own state, such as the activity, inbox and usage totals, in Claude Code's per-plugin store.

## COPS HQ pane

In Claude Code, a pane with a Threads section (its `Next:` line sits right under the heading, or under the waiting text on a branch without a PR), a separator, an Activity section, and a third section while the memory inbox holds lines, opens by itself when a review thread needs you or a `cops` agent starts. Close it and it stays closed for the session; `/cops-hq` opens it again, even while Claude is working. In a terminal narrower than 144 columns, a pane that opens by itself waits until the terminal widens; `/cops-hq` shows it at any width.

- **Threads:** the open review threads on the current branch's PR, grouped by whose move it is. The `PR #<n>` heading links to the PR, and each thread's `path:line` links to its last comment. A merged or closed PR is marked in the heading (`PR #7 (merged)`), and its threads don't open the pane by themselves. **Needs you** means a reviewer commented last; **waiting on reviewer** means the PR author did. Outdated threads are marked. Press `[ ]` beside a thread to mark it handled locally; the marks clear after the next successful `git push`. Resolved threads are left out, and so are your own `Note:` / `Drive-by:` threads once you 👍 them (they return if someone replies). It needs `gh` logged in; without it, the section says so.
- **Next:** the cops skill that fits the branch's PR right now, with why, and a **Use** button that puts it in the prompt box (when it can't, a toast names the skill to type). `/cops:pr-start` on a branch without a PR or whose PR is merged or closed, `/cops:pr-review` on someone else's PR, and on your own `/cops:pr-address` while threads need you (threads marked handled don't count). Before anyone has reviewed your PR or you've left notes, it walks the lifecycle: `/cops:pr-review` to self-review, then `/cops:pr-wrap-up` once a `pr-review` has run this session, then `/cops:pr-note` once a `pr-wrap-up` has. Otherwise it's left out, as it is when `gh` can't say who you are. The pane can't see whether a description is stale, so it suggests `pr-wrap-up` only at that step. When that skill already ran this session, the line says which run (`ran as 2.`).
- **Autopilot card:** while an [autopilot](#autopilot) run is on the branch's PR, a card under the heading takes the `Next:` line's place, with one row per step (fix, the four skills, ready). A stop reads `■ stopped at <step>` with a **Pick up** button that puts the stage's command in the prompt box. When all four skills ran and the PR is still a draft, the card reads `✓ finished · still a draft` with a **Mark ready** button: it runs `gh pr ready <n>`, toasts the result, and reads the PR again. It doesn't look at the banner's checkbox.
- **Activity:** every skill that ran this session, cops or not, with the agent calls each one made nested under it, so you can cross-check what ran against the `Next:` line:

  ```text
  Activity · 2 skills · 3 agents
  1. /cops:pr-review https://github.com/o/r/pull/7 · you · 3m ago
     ✓ 🔮 Oracle · haiku · review-pr · 40s · 30k tokens · 4 findings
  2. /cops:pr-address · model · just now
     ✓ 🔮 Oracle · inherit (claude-opus-5-5) · triage-threads + scout-repo · 20s · 12k tokens · …
     ⠋ 🦸 Sidekick · sonnet · 6 rules
  ```

  - Skill rows are numbered in order (`1.`, `2.`), the command in bold, with its arguments, who started them, and when: `you` typed the slash command, `model` means Claude called it, and `preloaded` means it came another way, such as a subagent's preloaded skill. A row tagged `(source:typed)` or `(source:tool.call)` was recorded from the typed command or the Skill call, because a managed plugin seated above cops (as on a team organization) kept its `skill.prompt` hook from running.
  - An agent call sits under the latest skill that started before it; calls made before any skill come first, unindented. Any agent gets a row with its status, the model it ran with (the call's model alias, or `inherit (<model id>)` when the call set none, bare `inherit` when no id is known), time, tokens and outcome (`✓ Explore · inherit · 3s · 12k tokens · …`); only a cops agent opens the pane by itself. Each `cops:pr-oracle` (🔮 Oracle) and `cops:pr-sidekick` (🦸 Sidekick) call shows what it was given and what it returned:
    - Oracle: its mode;
    - Sidekick: how many rules its `Rules that apply:` line carried and how many deviations it reported (`6 rules · 1 deviation`), and a red warning if its prompt carried `memory-root`, which it must never get;
    - for both: the outcome (`CHECKPOINT_FOUND <sha>`, `CHECKPOINT_NOT_FOUND`, `pushed <sha>`, `committed <sha>`, a findings count, or the first line), the time taken, and the tokens used. Each row starts with its status: a spinner while the call runs, `✓` when it's done, `✗` when it failed. Background calls show as running in the background.
- **Inbox:** while memory is on, the `memory-candidate:`, `promote:`, `conflict:` and `open:` lines cops agents return, each once, with the repository and PR they came from (e.g. `· ai-skills#59`). `open:` lines stay for the session; the rest are kept across sessions. **Park as candidate** (a `triage-threads` candidate) or **Remember** (a `grill-description` one) puts the matching request in the prompt box and clears the line; **Drop** clears it, and the same line isn't collected again, even in later sessions. It never writes memory.
- **Rules:** while memory is on, an **HQ | Rules | Stats** tab row tops the pane. Rules lists remembered rules a `brief-task` or `sweep-diff` reply hasn't cited in 30 days (or ever), each with a **Prune** button that puts a `learn-feedback` prune request in the prompt box, and rules cited 5+ times in 30 days as CLAUDE.md candidates, with counts and when each was last seen; the counts are kept across sessions. It never writes memory.
- **Stats:** the third tab. It starts with a `COPS <version>` line (e.g. `COPS 0.1.14`), read from the plugin's manifest and left out if the manifest can't be read. Its **Usage** section shows, for each pr-oracle mode set (`scout-repo + brief-task`) and pr-sidekick job (`fix loop`), how many calls finished, the average time and tokens per call, and the model(s) they ran on, most tokens first; the totals are kept across sessions, with a **since** date. **Reset** clears them at once, without a confirm step. Only calls that finish with a token count are counted; failed, background and otherwise unfinished calls aren't. It never writes memory.

The threads refresh at session start, after Bash commands that switch, commit, push, or pull branches or run `gh pr`, and every two minutes. No model is called; the grouping comes from who commented last.

All three live in one hooks module, [`hooks/cops.tsx`](hooks/cops.tsx). What they say is worked out in [`hooks/status-line.ts`](hooks/status-line.ts), [`hooks/pr-panel.ts`](hooks/pr-panel.ts), [`hooks/memory-inbox.ts`](hooks/memory-inbox.ts) and [`hooks/rule-band.ts`](hooks/rule-band.ts), plus [`hooks/autopilot-chain.ts`](hooks/autopilot-chain.ts) for the autopilot strip. Cursor doesn't load the module.

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
  picks its tier per job — `light` for mechanical edits, `standard` for scoped
  changes, `deep` for anything needing more judgment ([Subagent models](#subagent-models)).

### When the skills consult the oracle

- `pr-start` — `scout-repo` + `brief-task` in one call (how to run tests,
  the title prefix, the PR template, the evidence tooling and
  scenarios, and the remembered rules for the sidekick) before you
  confirm the task card, then `sweep-diff` on the
  commits the fix loop makes, before anything is pushed or the draft PR
  opens. On [autopilot](#autopilot), each of the four skills it runs next
  makes its own oracle calls, as listed here.
- `pr-note` — `draft-author-notes` runs on the user's own PR before anyone else has commented. It applies active memory, drafts `Note:` / `Drive-by:` comments, and identifies unexplained drive-bys to remove; the skill shows the draft and posts at most one review once you confirm (an autopilot stage posts it unconfirmed). `pr-wrap-up` and
  `oss:issue-fix` suggest it on a PR that has none yet. `pr-address` leaves both alone, and `pr-review` won't ask a
  `Question:` one of them already answers.
- `pr-review` — `review-pr` applies active memory, scouts the repository, reads complete PR and outside-diff context, verifies anchors, and returns structured `Question:` / `Suggestion:` / `Issue:` / `Test:` drafts for confirmation before the skill posts one review (an autopilot stage posts it unconfirmed). With **Fix, no post** on your own PR, a sidekick fixes the chosen findings instead (a `Question:` is put to you first and fixed from your answer; an `Issue:` is fixed test first), and `sweep-diff` checks its commits before they're pushed.
- `pr-address` — `triage-threads` + `scout-repo` in one call (the unresolved
  threads, the rules each matches, and how to run tests), then
  `sweep-diff` on each batch. A subagent implements low-risk asks, up
  to 10 threads per batch, seeing only those threads, not the parent
  chat, so the edit/test loop stays cheap in a long session.
- `pr-wrap-up` — `scout-repo` + `brief-task` in one call (changesets, the title
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

### Subagent models

Every subagent call has a tier: `light` (sorting, extracting, formatting; mechanical edits), `standard` (reading, summarising, drafting; scoped changes), or `deep` (finding bugs, judging trade-offs; cross-file judgment). An oracle call takes its mode's tier, or the highest of a combined call's modes; the table is in [`CONVENTIONS-orchestration.md`](CONVENTIONS-orchestration.md#consulting-the-pr-oracle-agent).

The session-start hook prints each tier's model as `COPS models: light=… standard=… deep=…`, and the skills pass a call's tier value as that subagent's model. Set a tier with `COPS_MODEL_LIGHT`, `COPS_MODEL_STANDARD`, or `COPS_MODEL_DEEP`:

- **Values are host-specific.** Use whatever your host accepts as a subagent's model for one call; `inherit` runs the call on the session's model.
- **Unset, empty, or not a plain model name → the host default.** On Claude Code that is `light=haiku`, `standard=sonnet`, `deep=opus`.
- **Cursor** sets a subagent's model only in its agent file, not per call, so every tier there is `inherit`.

For example, to keep deep work on your session's model in Claude Code, in `~/.claude/settings.json`:

```json
{
  "env": {
    "COPS_MODEL_LIGHT": "haiku",
    "COPS_MODEL_STANDARD": "sonnet",
    "COPS_MODEL_DEEP": "inherit"
  }
}
```

### Workspace memory

COPS never creates or synchronizes a machine-local memory store. Memory is optional and must be a Git repository already attached to the current workspace.

1. Create a memory Git repository and store oracle files under `memory/users/<github-login>/` and `memory/team/`.
2. Clone or attach that repository using the host's normal workspace controls.
3. Configure its workspace path and your GitHub login:
   - **Claude Code:** plugin options `memory_path` and `memory_login`, or environment variables `PR_MEMORY_PATH` and `PR_MEMORY_LOGIN`.
   - **Cursor:** plugin variables `PR_MEMORY_PATH` and `PR_MEMORY_LOGIN`.
   - `PR_MEMORY_LOGIN` names your personal tree, `memory/users/<login>/`. COPS never guesses it from `gh`, the GitHub MCP server, Git, or the folders already in the repo. Unset → team memory only; nothing personal is read or written.
   - Use an absolute path locally. In a Claude Code cloud environment, extra repositories are checked out at `/home/user/<repo-name>`, so use `/home/user/agent-memory`.

   ```text
   # Local workspace
   PR_MEMORY_PATH=/path/to/agent-memory
   PR_MEMORY_LOGIN=<your-github-login>

   # Claude Code cloud environment
   PR_MEMORY_PATH=/home/user/agent-memory
   PR_MEMORY_LOGIN=<your-github-login>
   ```

4. Use normal Git review, commit, pull, and push operations in that repository. COPS does none of them automatically.

The session-start hook trusts the configured location, expands `~/` or `$HOME/`, verifies that it is a Git root, checks that `PR_MEMORY_LOGIN` looks like a GitHub login, and injects both into context. It does not parse workspace metadata or modify Git or memory.

If the path is unset, the session-start hook says so, and the first COPS call tells you memory is off. If the path is missing or not a Git root, operational modes continue without memory and `learn-feedback` performs no write. COPS never falls back to `~/.claude`, `$XDG_DATA_HOME`, or another hidden directory.

When upgrading from local or hook-managed memory, copy only your `memory/users/<github-login>/` tree and the shared `memory/team/` tree into the attached repository, review the diff, and commit it normally. COPS does not migrate or publish those files automatically.
