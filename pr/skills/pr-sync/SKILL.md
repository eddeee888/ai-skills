---
name: pr-sync
description: Sync an open pull request with whatever is actually on the branch right now — rebase it onto its current base, then re-derive the title, description, and changeset from what's left, including the issue-tracker link (GitHub, Jira, Linear, etc.) and any external context (resource URLs, blog posts, Miro links) when they genuinely exist. Use when the user asks to "update the PR description", "sync the PR with my changes", "rebase and update the PR", "the PR is stale", "make the changeset match my changes", or after pushing new commits to a branch that already has an open PR. Also trigger proactively right after a round of commits if a PR is already open on the branch — PR descriptions go stale the moment someone tacks on a "quick fix" commit, and this closes that gap before a reviewer sees it. Only applies to an existing PR; if there's no open PR on the branch, this skill's job is to skip, not to open one.
---

# Sync PR with branch changes

A PR description is a snapshot of intent taken when the PR opened. The branch keeps moving after that — new commits, scope changes, a base that's advanced out from under it. This skill catches the branch up to its base, then re-derives the title, description, and changeset from what's actually there, so a reviewer never reads a stale summary or reviews a diff cluttered with someone else's already-merged commits.

## Step 1: Check whether a PR even exists

```bash
gh pr view --json number,title,body,url,baseRefName,headRefName 2>&1
```

Errors (no PR for the branch, or `gh` not installed/authenticated) → stop, tell the user there's no PR to sync, and don't create one — opening a PR is a different task with its own judgment calls (base branch, reviewers, draft-or-not).

Succeeds → keep the PR number and `baseRefName`; everything downstream diffs against that base, not the last commit.

## Step 2: Rebase onto the base branch

```bash
git fetch origin <baseRefName> --quiet
git rebase origin/<baseRefName>
```

Only on a branch that's yours alone — ask first if you're not sure, since rebasing out from under a collaborator loses their work on their next pull.

Clean → push:

```bash
git push --force-with-lease
```

Conflicts → stop. Resolve only the obvious ones (same file, clearly compatible changes on both sides); otherwise hand them to the user with what's conflicting and why. Never force it through with `--skip` or a guessed resolution.

## Step 3: Look at what's actually changed

```bash
git diff origin/<baseRefName>...HEAD --stat
git diff origin/<baseRefName>...HEAD
git log origin/<baseRefName>..HEAD --oneline
```

Read enough of the diff to understand the behavior change, not just the file list. Commit messages often already state the *why* — use them rather than guessing from the diff alone.

Empty diff → the PR is already current; say so and stop.

## Step 4: Check for a changeset, but only if the repo actually uses one

Get a `profile` of the repo from `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, first (`CONVENTIONS.md`). It answers this step (changesets, and the bump style existing entries use), Step 5's monorepo question for the title prefix, and Step 6's PR template headers — use it instead of rediscovering each. Not available → check each inline as written.

Look for `.changeset/config.json` or an equivalent already in use. Neither exists → skip this step entirely; don't introduce a changelog convention as a side effect of a sync task.

If present:
- A changeset file already exists for this branch → update its summary to match the current diff.
- None exists → create one, matching the bump type and voice already used in `.changeset/`.

The changeset always gets its own commit, never squashed into an implementation commit (Step 7 covers exactly where it lands).

## Step 5: Draft the title and description

Before drafting, get a `brief` from `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, for "PR description" in this repo (`CONVENTIONS.md`) — how the user likes descriptions written and what this repo's reviewers ask to see in them. Draft to it where it doesn't conflict with the rules below; where it does, the rules below win.

**Title** — one line, imperative, naming the net effect of the change. If the diff bundles a few unrelated things, name the most user-visible one rather than cramming everything in. Monorepo → apply the shared `[package-name]` prefix (`CONVENTIONS.md` at the repo root). Title already ends in a trailing `(#123)`-style issue reference → keep it, in the same form (`CONVENTIONS.md`); don't let a resync silently drop it.

**Description** — three required sections, in this order, kept tight, since this is a PR body a reviewer skims, not a design doc:

- **Why** — the reason this change exists at all. Pull it from commit messages, a linked issue, or the existing description if it already states intent; ask the user only if nothing indicates the motivation. Why is the *reason*, not a rephrasing of What. Must open with a paragraph starting `This PR ...` stating the mechanism by which it solves the issue, not just what the issue was — motivation bullets can follow.
- **What** — the concrete change, as a few short bullets: files, behavior, APIs touched. Specific enough that a reviewer doesn't have to open the diff to know what they're looking at.
- **Verification** — how a reader can trust the change actually works: tests added/updated, commands run and their result, manual steps (with the observed outcome), or CI checks that cover it. Pull this from commit messages, test files, and the diff; ask the user only if the branch gives no indication. Don't pad with "should work" — if nothing was verified, say that plainly. A check that already ran in CI gets named by test type, not the literal command (`CONVENTIONS.md`). Tests failing on purpose — a checkpoint commit with no fix yet — get stated plainly, never checklisted as passing (`CONVENTIONS.md`).

Keep all three sections short — one bullet per section is enough for a trivial PR, not padding to look thorough. In each section, bold the one claim that matters in a bullet — the causal reason, the chosen rationale, a caveat (`CONVENTIONS.md`); skip a bullet with nothing critical enough to call out.

**Resources** — one more section, only when there's actually something to put in it:

- The issue this PR tracks, wherever it lives. Pull it from an existing `Fixes #123`/`Relates to <KEY>`-style reference in a commit message or the PR body, the branch name, or the conversation. Preserve whichever keyword is already in use, closing or non-closing — never normalize one to the other as a side effect of rewriting this section; whether the PR should close the issue on merge isn't a resync's call to make (`CONVENTIONS.md`).
- Any external context that actually informed the fix — an upstream issue, a design doc, a blog post — only if one genuinely exists.

Don't go hunting for tangential links, and don't add a "Resources" section with nothing real in it. One line per link is plenty. Leave the section out entirely if neither an issue link nor external context exists.

## Step 6: Fit the update into the existing template — don't replace it

Check the PR's current body and, if present, `.github/pull_request_template.md` (or `PULL_REQUEST_TEMPLATE.md`). If the repo has its own headers — "Summary", "Testing", "How it was tested", "Screenshots", a checklist — map Why/What/Verification/Resources onto whichever existing header is the closest match instead of inventing new ones. Verification almost always has a home already ("Testing", "Test plan", "QA steps") — ease it in there; only add a standalone "## Verification" if nothing fits. Leave every section you have no new information for untouched. No template to work from → default to:

```markdown
## Why
This PR ...

- ...

## What
- ...

## Verification
- ...

## Resources
- ...
```

(omit the `## Resources` section entirely when Step 5 found nothing to put there)

The goal is a description that reads like it was written by the person who made the change, not one bulldozed by a script.

## Step 7: Apply it

First, run `pr:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor, in `check-description` mode on the drafted title and body (`CONVENTIONS.md`). It flags claims the diff doesn't back up, changes the draft leaves out, `CONVENTIONS.md` breaks, and misses against the user's remembered style — and learns from any edits the user made to the last description it saw applied. Fix each flag in the draft; one you disagree with (e.g. a style preference that doesn't fit this PR) → leave it and move on. Then apply:

```bash
gh pr edit <number> --title "<new title>" --body "<new body>"
```

A changeset file created or edited here is part of the PR, but never bundled into the same commit as the implementation change. Commit it separately, immediately after the commit it documents:

```bash
git add .changeset/*.md
git commit -m "chore: update changeset"
git push
```

If the implementation commit already has other commits stacked after it (this sync is catching up on a few rounds of pushes), the changeset commit still only needs to exist once, right after the fix — don't reorder existing history to force it earlier.

Then tell the user, briefly: whether the title changed, and a one-line summary of what moved in the description/changeset. Don't paste the full new PR body back at them.

## When to touch nothing

- No open PR on the branch → skip, say so, stop. This skill never opens a PR.
- Rebase conflicts you can't resolve confidently → stop and hand them to the user.
- Unsure whether the branch is shared with anyone else → ask before force-pushing a rebase.
- No diff since the PR's base → say it's already current, don't force an edit.
- No changeset tooling in the repo → don't add one.
