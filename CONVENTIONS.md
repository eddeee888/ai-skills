# Shared conventions

Formatting/process rules used by more than one skill in this marketplace.
Skills point here instead of restating a rule — change it once, and every
skill that points to it picks it up. Each pointer names its section
(`CONVENTIONS.md` → "<section>"); read only that section, not the whole file.

This file sits at the repo root, alongside both plugins, so it's present on
disk regardless of which individual plugin(s) a user installs.

## Monorepo title prefix: `[package-name]`

In a monorepo, lead a PR title with `[package-name]`, naming the package
the change is rooted in — e.g. `[package-name] fix: ...`. A change spanning
several packages leads with whichever carries the primary/root-cause
change, not a list of all of them. This applies to PR titles only — issue
titles aren't package-prefixed.

Used by: `pr:pr-sync` (title), `oss:issue-verify` (checkpoint PR title),
`oss:issue-fix` (fix PR title).

## Trailing issue reference in the PR title: `(#123)`

A PR title that references its issue puts the reference at the end, in
parens — `fix: <description> (#123)` — never mid-title. A resync keeps an
existing trailing reference rather than dropping it.

Used by: `oss:issue-verify`, `oss:issue-fix` (titles), `pr:pr-sync`
(preserving it on resync).

## Non-closing issue references: `Relates to #123` / `Refs #123`

A PR that doesn't fully resolve its issue on merge — a checkpoint PR, or a
fix PR still under review — references it with a non-closing keyword
(`Relates to #123` / `Refs #123`), never `Fixes`/`Closes`, so the issue
stays open until a maintainer closes it deliberately.

A resync preserves whichever keyword is already there; never normalize
`Relates to`/`Refs` up to `Fixes`/`Closes` (or the reverse) — whether the
PR should close the issue on merge isn't a resync's call to make.

Used by: `oss:issue-verify`, `oss:issue-fix`, `pr:pr-sync` (Resources —
preserving the existing keyword).

## Checkpoint/fix branch naming: `repro/<issue-number>` / `fix/<issue-number>`

A checkpoint (failing-test) branch is `repro/<issue-number>`; a fix branch
built on top of it, when it needs one of its own, is `fix/<issue-number>` —
paired names so it's obvious at a glance which fix answers which checkpoint.

Used by: `oss:issue-verify` (checkpoint branch), `oss:issue-fix` (fix
branch).

## Bold the critical claim in Why/What/Verification bullets

Within a bullet, bold (`**...**`) the one fact that matters — the causal
reason, the chosen rationale, a caveat — not the whole sentence. E.g. "This
fails because **component A fails to request component B**" or "Found
issue D. **Not fixed in this PR.**" Skip bullets with nothing critical
enough to call out.

Used by: `pr:pr-sync` (Why/What/Verification).

## Verification checklist: name the test type, not the command

When a check already ran the same way in CI, name the kind of test rather
than the literal command — `- [x] Unit tests`, not `- [x] Ran \`pnpm
test\``. Reserve the literal command for something run manually, outside
what CI already covers.

Used by: `pr:pr-sync` (Verification).

## Don't checklist an intentionally-failing check as done

When a branch's own tests are failing on purpose — a checkpoint commit with
no fix yet, not a broken build — say so plainly instead of checking it off:
`- [ ] Unit tests — intentionally failing, reproduces the bug`, never
`- [x]`. A checked box reads as "this works"; a checkpoint's whole point is
that it doesn't, yet.

Used by: `pr:pr-sync` (Verification), regardless of which skill produced
the branch.

## Hand long loops to a subagent

An implement/test/commit loop, a write-and-run test loop, a code survey, research, or a rebase-and-draft is tens of steps. On a host that resends the whole conversation every step (Cursor does), each of those steps in the main chat pays for everything already in it — hundreds of thousands of tokens late in a long session. A subagent's conversation holds only its prompt, so the same loop costs a fraction. A skill that hands a loop off supplies the prompt template; these rules hold for all of them:

- **Which agent.** Claude Code: the `general-purpose` agent for work that edits, runs, or pushes; the `Explore` agent for a read-only survey. Cursor: a subagent.
- **The prompt is only the template, filled in** — no transcript, no PR diff, no copy of the skill, nothing the template doesn't ask for. The subagent fetches anything else it needs itself.
- **It can't consult the sidekick.** Get what's needed from the sidekick in the main chat first and paste its output into the prompt.
- **One at a time on a shared checkout.** Subagents that edit the same checkout never run in parallel.
- **Short results.** It returns only the few lines the template asks for, and returns a question instead of guessing when a decision is the user's; the main chat asks the user and spawns it again with the answer.
- **Every spawn and check is a main-chat step.** Keep them few — batch where the skill says to.
- **No way to spawn a subagent** → do the same steps in the main chat.

Used by: `pr:pr-address` (5a batches, 5b research), `pr:pr-sync` (Steps 2–6),
`oss:issue-fix` (root cause, implementation), `oss:issue-verify` (the failing
test), `oss:issue-analyze` (code survey).

## Consulting the `pr-sidekick` agent

`pr/agents/pr-sidekick.md` remembers the user's recurring review themes and preferences — only rules that apply in every repo, never anything about one repo — and profiles a repo's working setup fresh on each call. Skills consult it at fixed points — `profile`, `classify`, `brief`, `check-diff`, `check-description` — and each skill names which mode it calls where. A skill that needs both `profile` and `brief` at the same point asks for them in one call (`profile` + `brief`), to save a round trip. The same agent file is the Claude Code agent and the Cursor subagent.

**Call it by the name this host actually has:**

- Claude Code — the `pr:pr-sidekick` agent.
- Cursor — delegate to the `pr-sidekick` subagent and wait for it. It starts blank, so the delegation prompt carries the mode and every input that mode lists. Its reply is the mode's output; continue the skill from there.

These rules hold everywhere:

- **Optional.** The agent isn't available (the `pr` plugin isn't installed, so neither name above exists) → do that step inline exactly as the skill describes, and carry on. Never stop because the sidekick is missing, and don't treat Cursor itself as missing.
- **Advice, not authority.** A brief or check informs the step; the user's current ask and the skill's own rules still win. When a remembered rule conflicts with what's being asked right now, surface the conflict to the user instead of silently picking one.
- **The skill acts, the agent doesn't.** Pushing, replying on threads, and editing the PR stay with the calling skill. When the agent's output includes `promote:`, mention it to the user once — a rule that only holds in this repo belongs in the repo's `CLAUDE.md`; the sidekick doesn't remember it.
- **Team memory.** When the user explicitly asked to remember something for the team, add `record-team: <one line>` to the delegation prompt. Do not add that line otherwise. The sidekick appends it only to `memory/team/MEMORY.md` in the memory repo.

Used by: `pr:pr-address` (classify + profile, check-diff), `pr:pr-sync`
(profile, brief, check-description), `oss:issue-create` (profile),
`oss:issue-verify` (profile), `oss:issue-fix` (profile, brief, check-diff).

## GitHub access: `gh`, or the GitHub MCP tools

Skills write their GitHub steps as `gh` commands. Not every host has `gh`: a Claude Code on the web session has no `gh` but has the GitHub MCP server (`mcp__github__*` tools).

- **Pick the route once.** At the first GitHub step, run `gh auth status`. It succeeds → use `gh` for the rest of the skill. It fails (not installed, not logged in) → use the GitHub MCP tools for the rest of the skill; on a host that loads them on demand, load each one with `ToolSearch` before its first call. Neither works → treat it as the step's own "no PR"/"can't reach the repo" failure.
- **Access errors.** On the `gh` route, a read that fails with 401/403/404 (org SSO, missing token scope) → retry that one read with the MCP tool before treating it as a failure.
- **Same effect, same gates.** The MCP call replaces the command one for one: a write still needs whatever confirmation the skill requires before the `gh` command.
- **Owner/repo.** MCP tools take them explicitly. For the current checkout, read them from `git remote get-url origin`. For "the current branch's PR", find it with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`).
- **Subagents.** A delegation prompt that has the subagent run `gh` names the route in use; on the MCP route, it names the MCP tool beside each command.

| `gh` | GitHub MCP |
|---|---|
| `gh api user --jq .login` | `get_me` → `login` |
| `gh pr view [<number>] --json …` | `pull_request_read` method `get` (no number → find the PR first, above) |
| `gh pr create --draft --title … --body …` | `create_pull_request` with `draft: true`, `head`, `base` |
| `gh pr edit <number> --title … --body-file …` | `update_pull_request` with `title`, `body` |
| review threads (`gh api graphql` … `reviewThreads`) | `pull_request_read` method `get_review_comments`, following `after` while `pageInfo.hasNextPage`; drop threads with `is_resolved: true`. Comments have no `databaseId`: it's the digits after `#discussion_r` in `html_url`. An outdated comment has no `line`; use `original_line`. |
| `gh api repos/<o>/<r>/pulls/comments/<id> --jq .body` | from `get_review_comments`, the comment whose `html_url` ends in `#discussion_r<id>` |
| `gh api repos/<o>/<r>/pulls/<n>/comments/<id>/replies -f body=…` | `add_reply_to_pull_request_comment` with `commentId: <id>`, `pullNumber`, `body` |
| `gh issue view <n> --json …,comments` | `issue_read` method `get`, then method `get_comments` |
| `gh issue list --repo <o>/<r> --search … --state all` | `search_issues` with `owner`, `repo`, `query` |
| `gh issue create --repo <o>/<r> --title … --body …` | `issue_write` method `create` |
| `gh issue comment <n> --body …` | `add_issue_comment` |
| `gh api repos/<o>/<r>/contents/<path>` (file or directory) | `get_file_contents` (`fields: ["name", "type"]` for a directory) |
| `gh api repos/<o>/<r> --jq .default_branch` | `search_repositories` with query `repo:<o>/<r>` → `default_branch` |
| `gh api repos/<o>/<r>/commits/<branch> --jq .sha` | `list_commits` with `sha: <branch>`, `perPage: 1`, `fields: ["sha"]` |

Used by: `pr:pr-address`, `pr:pr-sync`, `oss:issue-analyze`,
`oss:issue-create`, `oss:issue-verify`, `oss:issue-fix`. `pr-sidekick`
keeps its own copy of the read rows next to its tool allowlist.
