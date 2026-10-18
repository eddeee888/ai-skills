---
name: pr-wrap-up
description: 'Wrap up an open PR: rebase onto the current base, then update title, description, changeset and after-evidence from the final diff, keeping genuine issue links. Run only when asked: “wrap up the PR,” “finalize my PR,” “I’m done coding, wrap this up,” “update the PR description,” or “rebase and update the PR.”'
---

# Wrap up a PR

A PR description is a snapshot of intent from when the PR opened; the branch keeps moving — new commits, scope changes, an advancing base. This skill rebases the branch onto its base, then re-derives the title, description, and changeset from what's there, so a reviewer never reads a stale summary or a diff cluttered with already-merged commits.

GitHub steps are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS-github.md` → "GitHub access").

## How this runs

Only the short ends run here. Steps 2–6 — rebase, reading the branch, changeset, drafting — live in `draft.md` next to this file and run in one subagent (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"):

1. **Here:** Step 1, including the oracle call.
2. **Subagent:** Steps 2–6, with this prompt:

   ```text
   Repo <owner>/<repo>, PR #<number>, branch <headRefName> (checked out),
   base <baseRefName>. Current title: <title>.
   Follow Steps 2–6 in <this skill's directory>/draft.md; a `<details>`
   evidence manifest in the PR body also means recapture.md beside it.
   Oracle profile and brief: <what it returned, or "none">
   Resuming: <"no" | the question you returned last time, and the user's answer>
   GitHub: <"gh" | "MCP — read the PR body with pull_request_read method get
   instead of gh; load it with ToolSearch first if needed">
   Stop and return a question instead of guessing when the branch may be
   shared with someone else, a rebase conflict isn't obvious, or nothing
   states the motivation for Why. When resuming, use the answer and pick up
   at the step that asked; don't redo a rebase, changeset commit or push
   that's already on origin.
   Write the drafted title to <scratch dir>/pr-wrap-up-title.txt and the body
   to <scratch dir>/pr-wrap-up-body.md (the session's scratch directory, else
   a `mktemp -d` directory; absolute paths). Return both paths. Don't edit the PR.
   Return at most 5 lines: pushed (sha, or "nothing to push"), changeset
   (created | updated | none), title changed (yes/no),
   evidence (n captured, n stale, n none), one line on what moved — or the
   question, or "already current".
   ```

   "Already current" → say so and stop. A question → ask the user, then spawn it again with `Resuming:` filled in (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent").
3. **Here:** Step 7, on the draft files.

No way to spawn a subagent → read `draft.md` and run Steps 2–6 here.

## Step 1: Check whether a PR exists

```bash
gh pr view --json number,title,url,author,baseRefName,headRefName 2>&1
```

On the MCP route, find the branch's PR with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`), then `pull_request_read` method `get`.

Errors (no PR for the branch, or neither `gh` nor the GitHub MCP tools work) → stop, tell the user there's no PR to wrap up, and don't create one — opening a PR is a different task with its own judgment calls (base, reviewers, draft-or-not).

Succeeds → keep the PR number and `baseRefName`; everything downstream diffs against that base, not the last commit.

Before spending an oracle call and a subagent, check there's anything to wrap up:

```bash
git fetch origin <baseRefName> --quiet
git diff --quiet origin/<baseRefName>...HEAD && echo "no diff"
```

`no diff` and no evidence to capture → say the PR is already current and stop. A `<details>` evidence manifest in the PR body (already fetched in this step by the selected route: `gh pr view` fields or MCP `pull_request_read` `get`) means `recapture.md`'s check runs here too; any after missing or stale → go on. Body can't be read → the "nothing to wrap up" stop is not taken on evidence grounds; say the evidence check was skipped.

Get the repo's profile and a brief for "PR description" with `for: pr-sidekick` in one call (`scout-repo` + `brief-task`) from `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"), passing the selected `GitHub route:`. Both go into the subagent's prompt: the profile answers Steps 4–6's changeset, title-prefix and template questions; the brief shapes Step 5's draft. Apply any `caller only:` lines yourself; keep them out of the prompt. Not available → pass "none"; the steps check inline. With an `autopilot profile:` line in the stage prompt (see Step 7's autopilot exception), call `brief-task` alone and use that profile.

## Step 7: Apply it

First, run `bash "${CLAUDE_PLUGIN_ROOT:-$CURSOR_PLUGIN_ROOT}/scripts/lint-pr-body.sh" "$(git rev-parse --git-dir)/pr-wrap-up-body.md"` and fix each failure, except one that conflicts with a profile `overrides:` line or the user's ask: that stands. Then run `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `grill-description` mode on the drafted title and body — pass owner/repo, PR number, the selected `GitHub route:`, base ref (`origin/<baseRefName>`), the two draft file paths rather than their text, and any description preference stated in this conversation. It flags claims the diff doesn't back, changes the draft leaves out, shared-convention breaks, and misses against active or relayed style without writing memory. Fix each flag in the draft files; one you disagree with (e.g. a style preference that doesn't fit this PR) → leave it.

If the user explicitly asked to remember a concrete preference, call `learn-feedback` separately with the preference, provenance, and personal or `record-team:` intent. Show any other `memory-candidate:` result and ask for consent before a later `learn-feedback` call. Then apply:

```bash
d=<directory of the returned draft paths>
gh pr edit <number> --title "$(cat "$d/pr-wrap-up-title.txt")" --body-file "$d/pr-wrap-up-body.md"
rm "$d/pr-wrap-up-title.txt" "$d/pr-wrap-up-body.md"
```

On the MCP route, call `update_pull_request` with the two files' contents as `title` and `body`, then remove the files.

Then tell the user briefly whether the title changed, plus one line on what moved in the description/changeset. Don't paste the new PR body back. Don't run `cops:pr-note`; suggest it per `CONVENTIONS-orchestration.md` → "Suggesting next steps", using the PR's `author.login` from Step 1. Autopilot exception: as a stage of a `/cops:pr-start` autopilot run the user started or resumed ([autopilot.md](../pr-start/autopilot.md)), suggest nothing, keep the banner per `draft.md` Step 6, and treat every point that would ask the user, including a subagent question, as a stop; label the Step 1 handoff `brief-task` when the oracle call was that alone. End with the handoffs list (`CONVENTIONS-orchestration.md` → "Handoffs in the final report"), with labels `scout-repo + brief-task`, `draft`, `grill-description`, and `learn-feedback` when run.

## When to touch nothing

- No open PR on the branch → skip, say so, stop. This skill never opens a PR.
- Rebase conflicts you can't resolve confidently → stop and hand them to the user.
- Unsure whether the branch is shared with anyone else → ask before force-pushing a rebase.
- No diff since the PR's base → say it's already current; don't force an edit.
- No changeset tooling in the repo → don't add one.
