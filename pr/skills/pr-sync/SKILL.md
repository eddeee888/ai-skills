---
name: pr-sync
description: Sync an open pull request with what's actually on its branch — rebase onto its current base, then re-derive the title, description, and changeset from what's left, including the issue-tracker link and any external context that genuinely exists. Use when the user asks to "update the PR description", "sync the PR with my changes", "rebase and update the PR", "the PR is stale", or "make the changeset match my changes". Run it only when asked — other skills suggest it rather than run it. Only applies to an existing PR; with no open PR on the branch, skip rather than open one.
---

# Sync PR with branch changes

A PR description is a snapshot of intent taken when the PR opened. The branch keeps moving after that — new commits, scope changes, a base that's advanced out from under it. This skill catches the branch up to its base, then re-derives the title, description, and changeset from what's actually there, so a reviewer never reads a stale summary or reviews a diff cluttered with someone else's already-merged commits.

GitHub steps are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## How this runs

Only the short ends run here. Steps 2–6 — rebase, reading the branch, changeset, drafting — live in `draft.md` next to this file and run in one subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"):

1. **Here:** Step 1, including the oracle call.
2. **Subagent:** Steps 2–6, with this prompt:

   ```text
   Repo <owner>/<repo>, PR #<number>, branch <headRefName> (checked out),
   base <baseRefName>. Current title: <title>.
   Follow Steps 2–6 in <this skill's directory>/draft.md.
   Oracle profile and brief: <what it returned, or "none">
   Resuming: <"no" | the question you returned last time, and the user's answer>
   GitHub: <"gh" | "MCP — read the PR body with pull_request_read method get
   instead of gh; load it with ToolSearch first if needed">
   Stop and return a question instead of guessing when the branch may be
   shared with someone else, a rebase conflict isn't obvious, or nothing
   states the motivation for Why. When resuming, use the answer and pick up
   at the step that asked; don't redo a rebase, changeset commit or push
   that's already on origin.
   Write the drafted title to $(git rev-parse --git-dir)/pr-sync-title.txt
   and the body to $(git rev-parse --git-dir)/pr-sync-body.md, outside the
   working tree. Don't edit the PR.
   Return at most 5 lines: pushed (sha, or "nothing to push"), changeset
   (created | updated | none), title changed (yes/no), one line on what
   moved — or the question, or "already current".
   ```

   "Already current" → say so and stop. A question → ask the user, then spawn it again with `Resuming:` filled in (`CONVENTIONS.md` → "Hand long loops to a subagent").
3. **Here:** Step 7, on the draft files.

No way to spawn a subagent → read `draft.md` and run Steps 2–6 here.

## Step 1: Check whether a PR even exists

```bash
gh pr view --json number,title,url,baseRefName,headRefName 2>&1
```

On the MCP route, find the branch's PR with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`), then `pull_request_read` method `get`.

Errors (no PR for the branch, or neither `gh` nor the GitHub MCP tools work) → stop, tell the user there's no PR to sync, and don't create one — opening a PR is a different task with its own judgment calls (base branch, reviewers, draft-or-not).

Succeeds → keep the PR number and `baseRefName`; everything downstream diffs against that base, not the last commit.

Before spending an oracle call and a subagent, check there's anything to sync:

```bash
git fetch origin <baseRefName> --quiet
git diff --quiet origin/<baseRefName>...HEAD && echo "no diff"
```

`no diff` → the branch has nothing beyond its base; say the PR is already current and stop.

Get the repo's profile and a brief for "PR description" in one call (`scout-repo` + `brief-task`) from `pr:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"). Both go into the subagent's prompt: the profile answers the changeset, title-prefix and template questions in Steps 4–6, the brief shapes Step 5's draft. Not available → pass "none"; the steps check inline.

## Step 7: Apply it

First, run `pr:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `grill-description` mode on the drafted title and body — pass the two draft file paths, not their text. When the user explicitly asked to remember something for the team, also pass `record-team: <one line>`. When the user stated a description preference in this conversation ("keep the Why to one sentence"), pass it along in their words. It flags claims the diff doesn't back up, changes the draft leaves out, `CONVENTIONS.md` breaks, and misses against the user's remembered style — and remembers any preference you passed along. Fix each flag in the draft files; one you disagree with (e.g. a style preference that doesn't fit this PR) → leave it and move on. Then apply:

```bash
d="$(git rev-parse --git-dir)"
gh pr edit <number> --title "$(cat "$d/pr-sync-title.txt")" --body-file "$d/pr-sync-body.md"
rm "$d/pr-sync-title.txt" "$d/pr-sync-body.md"
```

On the MCP route, call `update_pull_request` with the two files' contents as `title` and `body`, then remove the files.

Then tell the user, briefly: whether the title changed, and a one-line summary of what moved in the description/changeset. Don't paste the full new PR body back at them. End with the handoff line (`CONVENTIONS.md` → "Handoff line in the final report"), with labels `scout-repo + brief-task`, `draft`, and `grill-description`.

## When to touch nothing

- No open PR on the branch → skip, say so, stop. This skill never opens a PR.
- Rebase conflicts you can't resolve confidently → stop and hand them to the user.
- Unsure whether the branch is shared with anyone else → ask before force-pushing a rebase.
- No diff since the PR's base → say it's already current, don't force an edit.
- No changeset tooling in the repo → don't add one.
