# Shared conventions: orchestration

## Hand long loops to a subagent

When a skill names a handoff and the host can spawn a subagent, make it every time. This includes implement/test/commit, write/run-test, survey, research, and rebase/draft loops. Size or already-read code is no exemption. If handoff seems pure overhead, ask; never silently skip.

- **Which agent.** Editing, running, or pushing → `pr-sidekick` (`cops:pr-sidekick` on Claude Code; `pr-sidekick` subagent on Cursor), passing `login: <github-login>` when known. Complete PR review or author-note drafting → `pr-oracle` under "Consulting the `pr-oracle` agent". If `cops` is absent → `general-purpose` on Claude Code or a subagent on Cursor. Other read-only survey/research → `Explore` on Claude Code or a subagent on Cursor.
- **The caller picks the model by tier.** Every subagent call has one: `light` for mechanical work (also say "mechanical"), `standard` for a scoped change/survey, `deep` for cross-file judgment; oracle modes are tiered below. Pass the tier's value from the `COPS models:` line as the model. Omit it only for `inherit`, no such line, or a host without per-call models (Cursor). Mostly-design work stays in main chat.
- **The prompt is only the filled template**: no transcript, diff, skill copy, or unrequested material.
- **An editing subagent can't consult the oracle or read memory.** Main chat calls `pr-oracle` first and includes needed output, with `for: pr-sidekick` on `brief-task`.
- **One at a time on a shared checkout.** Never parallel editing subagents.
- **Short results.** Return only requested lines; a question, not a guess. Main chat asks the user, then respawns with the answer.
- **Round.** Every spawn/check is a main-chat step. A round's fix commits get one `sweep-diff` (pre-round to `HEAD`), one push.
- **Foreground when dependent.** Run a call in the foreground when the next step needs its result; background only independent work.
- **Bounded retries.** "Until" allows at most 3 attempts. After the third, stop, leave work uncommitted, and report attempts and remaining failure; do not respawn unasked.
- **Resume, don't restart.** After a question, carry question+answer and resume, checking completed rebase/commit/push work.
- **No way to spawn** means no subagent tool at all, not inconvenience. Run inline and mark `inline` under "Handoffs in the final report".

Required handoffs: `cops:pr-address` (5a batches, 5b research); `cops:pr-wrap-up` (Steps 2–6); `cops:pr-review` (`review-pr`, fix loop); `cops:pr-note` (`draft-author-notes`); `cops:pr-start` (fix loop); `oss:issue-fix` (root cause, implementation); `oss:issue-verify` (failing test); `oss:issue-analyze` (code survey).

## Handoffs in the final report

A skill naming subagent or `pr-oracle` handoffs ends with `Handoffs:`, one applicable handoff per bullet in skill order:

```markdown
Handoffs:
- scout-repo ✓
- root cause ✓
```

- `✓`: ran as specified.
- `✓ (incomplete load: <files>)`: oracle ran but its `loaded:` still lacked required files after one retry.
- `fallback (pr-oracle unavailable; general read-only subagent)`: valid only for labels `review-pr` and `draft-author-notes`, after applying the oracle mode contract to that subagent.
- `inline (no subagent capability)`: valid for a named subagent handoff only when no subagent tool exists.
- `inline (cops plugin isn't installed)`: valid for an oracle handoff only when `cops` is absent.
- `✗ (<reason>)`: skipped only with user agreement.

Oracle labels use the named mode(s), joined with ` + ` for a combined call. Other labels are the skill's named handoff. Omit inapplicable handoffs. If an honest mark would be unauthorized `✗`, invalid `inline`, invalid `fallback`, or an invented label, perform the handoff before reporting.

Final-report users: every `cops` and `oss` skill.

## Companion plugin: `cops`

`oss` works alone; when installed, `cops` supplies `pr-oracle`, `pr-sidekick`, and `pr-wrap-up`.

- **How to tell.** Installed when this session has `cops:pr-oracle`, `cops:pr-sidekick`, `/cops:pr-wrap-up` on Claude Code; or `pr-oracle`, `pr-sidekick`, `/pr-wrap-up` on Cursor. Check once and cache. Cursor is never missing.
- **Missing → fall back, never stop or ask for installation.** `pr-oracle` → perform its specified step inline and mark `inline (cops plugin isn't installed)`; `pr-sidekick` → general-purpose/subagent fallback above; `pr-wrap-up` → say title and description need manual updating, without naming `/cops:pr-wrap-up`.
- **Defaults without the oracle.** With no profile/`overrides:`, inspect repo `CLAUDE.md` and `CONTRIBUTING.md` before applying a *Default*.

## Suggesting next steps

A skill never runs another skill to finish, except under "Autopilot runs"; it only suggests each applicable step once before `Handoffs:`, and only for the user's own PR, determined by `gh api user --jq .login` or `get_me`.

- PR just opened → `/cops:pr-review self-reviews it; "fix, no post" skips posting.` (`/pr-review` on Cursor).
- An existing PR was pushed; title/body may be stale → `The PR's title and description may now be stale; /cops:pr-wrap-up will update them.` (`/pr-wrap-up` on Cursor).
- No thread comment by anyone else and no user `Note:`/`Drive-by:` in either label form → `/cops:pr-note will post your reasoning and drive-bys as inline comments for reviewers.` (`/pr-note` on Cursor).

Without `cops`, give only a manual `pr-wrap-up` line.

## Autopilot runs

The one exception to "Suggesting next steps". Once the user confirms a `/cops:pr-start` task card naming every outward action it authorises, that run opens the draft PR, then runs `cops:pr-review`, `cops:pr-address`, `cops:pr-wrap-up`, and `cops:pr-note` in that order, each as its own skill run with its own `Handoffs:`.

- **The card is the only prompt.** Stages post and push without further confirmation and suggest no next step.
- **Nothing is asked mid-run.** Any failure or subagent question ends the run, leaving the PR a draft; the user's own "resume the rest with autopilot" continues it.
- **Only that run starts a stage.** No other skill or stage argument does.

## Consulting the `pr-oracle` agent

Skills call it at their named points in modes `scout-repo`, `triage-threads`, `brief-task`, `sweep-diff`, `grill-description`, `review-pr`, `draft-author-notes`, and `learn-feedback`. At one point combine required operational modes: `scout-repo` + `brief-task`, `triage-threads` + `scout-repo`, or `scout-repo` + `sweep-diff`. Review and learning modes are always separate calls.

- Claude Code calls `cops:pr-oracle`; Cursor delegates to `pr-oracle` with the mode and every listed input. Foreground or background follows "Hand long loops to a subagent".
- **Model by tier.** A call takes its mode's tier, or a combined call's highest; a mode's fallback subagent takes the same. Pass the model as "Hand long loops to a subagent" says.

  | Tier | For | Modes |
  | --- | --- | --- |
  | `light` | sorting, extracting, formatting | `brief-task` |
  | `standard` | reading, summarising, drafting | `scout-repo`, `triage-threads`, `sweep-diff`, `grill-description`, `learn-feedback` |
  | `deep` | finding bugs, judging trade-offs | `review-pr`, `draft-author-notes` |
- **Optional only when missing.** If `cops` is absent, perform the step inline, continue, and mark fallback. Small changes do not exempt calls. When present, call every named point; nothing inline replaces `sweep-diff` or `brief-task` as checks of remembered rules.
- **Advice, not authority.** Current ask and skill rules win, except remembered rules override *Defaults*. Surface memory conflicts to the user.
- **The skill acts, the agent doesn't.** Caller pushes, replies, and edits. Report `promote:` once (repo-only rule belongs in `CLAUDE.md`). Show both rules for `conflict:` from an unrecorded contradictory `record-team:`.
- **Pass what you have.** Include `login: <github-login>` if known; always include the selected `GitHub route:`. Later `scout-repo` calls get the run's first profile as `profile:`; `overrides:` is rebuilt from current memory. Review modes get owner/repo, PR number/URL, saved full head SHA, checkout status/path, and mode-specific inputs.
- **Check what it loaded.** Every reply's `loaded:` must include `memory.md` and `modes/<mode>.md` per named mode. Missing or no `loaded:` → call again once, naming the missing files to read first. Still missing → use the reply and mark the handoff `✓ (incomplete load: <files>)`.
- **Pass memory context.** Session context supplies the verified COPS memory root and configured memory login, or says each is unavailable/unset. Pass `memory-root: <absolute path | unavailable>` and `memory-login: <login | unset>` to every `pr-oracle` call. Never pass them to `pr-sidekick`: it reads no memory, and gets remembered rules only as oracle lines, `[U-014]` IDs kept, in its prompt. Never fill `memory-login` from `gh`, `get_me`, or `login:`.
- **Graduated memory consent.** Operational modes never write memory. Show `memory-candidate:` to the user; only explicit remember or promotion intent permits a separate `learn-feedback` call. On `not concrete:`, ask the user to restate the rule and call again with their wording; never rephrase it for them. Reviewer-derived rules stay inactive candidates until explicitly promoted.
- **Team memory.** Only a separate `learn-feedback` call for an explicit team-memory request receives `record-team: <one line>`.

Review modes scout repository context, read complete PR evidence, verify new-side changed-line anchors, return structured YAML, and never write GitHub or memory. If the oracle is unavailable but a subagent tool exists, run one general read-only subagent with the oracle mode contract. No subagent capability → run it inline. Never replace review with `sweep-diff`.

Call points: `cops:pr-address` (`triage-threads` + `scout-repo`, `sweep-diff`); `cops:pr-wrap-up` (`scout-repo`, `brief-task`, `grill-description`); `cops:pr-review` (`review-pr`, `sweep-diff`); `cops:pr-note` (`draft-author-notes`); `cops:pr-start` (`scout-repo` + `brief-task`, `sweep-diff`); `oss:issue-analyze` and `oss:issue-create` (`scout-repo`); `oss:issue-verify` (`scout-repo`, `brief-task`); `oss:issue-fix` (`scout-repo`, `brief-task`, `sweep-diff`).
