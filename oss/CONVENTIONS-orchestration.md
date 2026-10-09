# Shared conventions: orchestration

## Hand long loops to a subagent

When a skill names a handoff and the host can spawn a subagent, make it every time. This includes implement/test/commit, write/run-test, survey, research, and rebase/draft loops. Size or already-read code is no exemption. If handoff seems pure overhead, say so and ask; never silently skip.

- **Which agent.** Editing, running, or pushing → `pr-sidekick` (`cops:pr-sidekick` on Claude Code; `pr-sidekick` subagent on Cursor), passing `login: <github-login>` when known. Complete PR review or author-note drafting → `pr-reviewer` under "Consulting the `pr-reviewer` agent". If `cops` is absent → `general-purpose` on Claude Code or a subagent on Cursor. Other read-only survey/research → `Explore` on Claude Code or a subagent on Cursor.
- **The caller picks the model.** Where supported: `haiku` for mechanical work (also say "mechanical"), `sonnet` for a scoped change/survey, unset for cross-file judgment. Mostly-design work stays in main chat.
- **The prompt is only the filled template**: no transcript, diff, skill copy, or unrequested material.
- **It can't consult the oracle.** Main chat calls `pr-oracle` first and includes needed output.
- **One at a time on a shared checkout.** Never parallel editing subagents.
- **Short results.** Return only requested lines; return a question rather than guess. Main chat asks the user, then respawns with the answer.
- **Every spawn/check is a main-chat step.** Batch as instructed.
- **Bounded retries.** "Until" allows at most 3 attempts. After the third, stop, leave work uncommitted, and report attempts and remaining failure; do not respawn unasked.
- **Resume, don't restart.** After a question, carry question+answer and resume at that step, checking completed rebase/commit/push work.
- **No way to spawn** means no subagent tool at all, not inconvenience. Run inline and mark `inline` under "Handoffs in the final report".

Required handoffs: `cops:pr-address` (5a batches, 5b research); `cops:pr-sync` (Steps 2–6); `cops:pr-review` (`review-pr`); `cops:pr-note` (`draft-author-notes`); `oss:issue-fix` (root cause, implementation); `oss:issue-verify` (failing test); `oss:issue-analyze` (code survey).

## Handoffs in the final report

A skill naming subagent or `pr-oracle` handoffs ends with `Handoffs:`, one applicable handoff per bullet in skill order:

```markdown
Handoffs:
- scout-repo ✓
- root cause ✓
```

- `✓`: ran as specified.
- `fallback (pr-reviewer unavailable; general read-only subagent)`: valid only for labels `review-pr` and `draft-author-notes`, after applying the named reviewer's contract to that subagent.
- `inline (no subagent capability)`: valid for a named subagent handoff only when no subagent tool exists.
- `inline (cops plugin isn't installed)`: valid for an oracle handoff only when `cops` is absent.
- `✗ (<reason>)`: skipped only with user agreement.

Reviewer labels are exactly `review-pr` and `draft-author-notes`; oracle labels use the named mode(s), joined with ` + ` for a combined call. Other labels are the skill's named handoff. Omit inapplicable handoffs. If an honest mark would be unauthorized `✗`, invalid `inline`, invalid `fallback`, or an invented label, perform the handoff before reporting.

Final-report users: `cops:pr-address`, `cops:pr-sync`, `cops:pr-review`, `cops:pr-note`, `oss:issue-analyze`, `oss:issue-create`, `oss:issue-verify`, and `oss:issue-fix`.

## Companion plugin: `cops`

`oss` works alone; when installed, `cops` supplies `pr-oracle`, `pr-reviewer`, `pr-sidekick`, and `pr-sync`.

- **How to tell.** Installed when this session has `cops:pr-oracle`, `cops:pr-reviewer`, `cops:pr-sidekick`, `/cops:pr-sync` on Claude Code; or `pr-oracle`, `pr-reviewer`, `pr-sidekick`, `/pr-sync` on Cursor. Check once at first need and cache for the run. Cursor itself is never "missing".
- **Missing → fall back, never stop or ask for installation.** `pr-oracle` → perform its specified step inline and mark `inline (cops plugin isn't installed)`; `pr-sidekick` → general-purpose/subagent fallback above; `pr-sync` → say title and description need manual updating, without naming `/cops:pr-sync`.
- **Defaults without the oracle.** With no profile/`overrides:`, inspect repo `CLAUDE.md` and `CONTRIBUTING.md` before applying a *Default*.

## Suggesting next steps

A skill never runs another skill to finish; it only suggests each applicable step once before `Handoffs:`, and only for the user's own PR, determined by `gh api user --jq .login` or `get_me`.

- Existing PR was pushed and title/body may be stale (not a PR just opened) → `The PR's title and description may now be stale; /cops:pr-sync will update them.` (`/pr-sync` on Cursor).
- Review threads contain no comment by anyone else and no user `Note:`/`Drive-by:` in either label form → `/cops:pr-note will post the reasoning behind the PR's choices, and any drive-by change, as inline comments for reviewers.` (`/pr-note` on Cursor).

If `cops` is absent, replace the first with manual-update wording and omit `pr-note`.

## Consulting the `pr-oracle` agent

Skills call it at their named points in modes `scout-repo`, `triage-threads`, `brief-task`, `sweep-diff`, `grill-description`, and `learn-feedback`. At one point combine required operational modes: `scout-repo` + `brief-task`, `triage-threads` + `scout-repo`, or `scout-repo` + `sweep-diff`. `learn-feedback` is always a separate call.

- Claude Code calls `cops:pr-oracle`; Cursor delegates to `pr-oracle`, waits, and supplies the mode plus every listed input because it starts blank.
- **Optional only when missing.** If `cops` is absent, perform the exact step inline, continue, and mark fallback. Small changes do not exempt calls. When present, call every named point; nothing inline replaces `sweep-diff` or `brief-task` as checks of remembered rules.
- **Advice, not authority.** Current ask and skill rules win, except remembered rules override *Defaults*. Surface memory/current-ask conflicts to the user.
- **The skill acts, the agent doesn't.** Caller pushes, replies, and edits. Report `promote:` once (repo-only rule belongs in `CLAUDE.md`). Show both rules for `conflict:` from an unrecorded contradictory `record-team:`.
- **Pass what you have.** Include `login: <github-login>` if known. Oracle uses GitHub MCP only; never give it a route or `gh` commands.
- **Pass memory context.** Session context supplies a resolved COPS memory root, or a configured remote to match among attached workspace repositories. Resolve it once; zero/multiple matches mean unavailable. Pass `memory-root: <absolute path | unavailable>` to every `pr-oracle` and `pr-sidekick` call because agents start blank.
- **Graduated memory consent.** Operational modes never write memory. Show `memory-candidate:` to the user; only explicit remember or promotion intent permits a separate `learn-feedback` call. Reviewer-derived rules stay inactive candidates until explicitly promoted.
- **Team memory.** Only a separate `learn-feedback` call for an explicit team-memory request receives `record-team: <one line>`.

Call points: `cops:pr-address` (`triage-threads` + `scout-repo`, `sweep-diff`); `cops:pr-sync` (`scout-repo`, `brief-task`, `grill-description`); `cops:pr-review` (`brief-task`); `cops:pr-note` (`brief-task`); `oss:issue-analyze`, `oss:issue-create`, and `oss:issue-verify` (`scout-repo`); `oss:issue-fix` (`scout-repo`, `brief-task`, `sweep-diff`).

## Consulting the `pr-reviewer` agent

`cops:pr-review` calls `pr-reviewer` in `review-pr`; `cops:pr-note` calls it in `draft-author-notes`. The caller supplies applicable rules from `brief-task`, owner/repo, PR number/URL, full saved head SHA, login, selected GitHub route, checkout status/path, and mode-specific inputs. The reviewer is read-only: it scouts repository context, reads complete PR evidence, verifies new-side changed-line anchors, returns structured YAML, and never writes GitHub or memory.

- Claude Code calls `cops:pr-reviewer`; Cursor delegates to `pr-reviewer` and waits.
- If the named reviewer is unavailable but a subagent tool exists, read its agent contract and run one general read-only subagent with that contract and filled prompt; report `fallback (pr-reviewer unavailable; general read-only subagent)`.
- If no subagent capability exists, run the same contract inline; report `inline (no subagent capability)`.
- Never replace review with `pr-oracle` `sweep-diff`: that mode only matches remembered rules.
