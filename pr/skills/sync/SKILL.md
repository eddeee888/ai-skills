---
name: sync
description: Sync an open pull request's title, description, and changeset with whatever is actually on the branch right now — including the issue-tracker link (GitHub, Jira, Linear, etc.) and any external context (resource URLs, blog posts, Miro links) when they genuinely exist. Use when the user asks to "update the PR description", "sync the PR with my changes", "the PR is stale", "make the changeset match my changes", or after pushing new commits to a branch that already has an open PR. Also trigger proactively right after a round of commits if a PR is already open on the branch — PR descriptions go stale the moment someone tacks on a "quick fix" commit, and this closes that gap before a reviewer sees it. Only applies to an existing PR; if there's no open PR on the branch, this skill's job is to skip, not to open one.
---

# Sync PR with branch changes

A PR description is a snapshot of intent taken when the PR was opened. The branch keeps moving after that — new commits, scope changes, follow-up fixes — and the description doesn't update itself. This skill re-derives the title, description, and changeset from what's actually on the branch, so a reviewer never reads a summary that's lying to them.

## Step 1: Check whether a PR even exists

```bash
gh pr view --json number,title,body,url,baseRefName,headRefName,isDraft 2>&1
```

If this errors (no PR for the current branch) or `gh` isn't installed/authenticated, stop immediately. Tell the user there's no open PR to sync and don't create one — opening a new PR is a different task with different judgment calls (base branch, reviewers, draft-or-not), and quietly doing it as a side effect of "sync" would surprise them.

If it succeeds, keep the PR number and the `baseRefName` — everything downstream is diffed against that base, not against the last commit.

## Step 2: Look at what's actually changed

Diff against the PR's base, not just `HEAD~1`, so you catch everything since the PR started — including commits added after the description was last written:

```bash
git fetch origin <baseRefName> --quiet
git diff origin/<baseRefName>...HEAD --stat
git diff origin/<baseRefName>...HEAD
git log origin/<baseRefName>..HEAD --oneline
```

Read enough of the actual diff to understand the behavior change, not just the file list — "modified 6 files" is true whether it's a rename or a new API endpoint, and those need very different descriptions. Commit messages often already state the *why*; don't ignore them in favor of guessing from the diff alone.

If the diff against the base is empty, the PR is already current — say so and stop. Don't force an edit just to have done something.

## Step 3: Check for a changeset, but only if the repo actually uses one

Look for `.changeset/config.json` (Changesets) or an equivalent already in use in the repo. If neither exists, skip this step entirely — don't introduce a changelog convention as a side effect of a sync task; that's a bigger decision for the repo owner to make deliberately.

If a changeset system is present:
- Check whether a changeset file already exists for this branch (a new file under `.changeset/` that isn't in `origin/<baseRefName>` yet).
- If one exists, update its summary so it matches the current diff.
- If none exists, create one, matching the bump type and one-line voice already used by other entries in `.changeset/`.

Either way, **the changeset always gets its own commit, never squashed into an implementation commit** — see Step 6 for exactly where it lands in the branch's history.

## Step 4: Draft the title and description

**Title** — one line, imperative, naming the net effect of the change. If the diff spans a few unrelated things, name the most user-visible one and note the rest is bundled in, rather than trying to cram every change into the title.

**Description** — two required sections, kept tight, since this is a PR body a reviewer skims, not a design doc:

- **What** — the concrete change, as a few short bullets: files, behavior, APIs touched. Specific enough that a reviewer doesn't have to open the diff just to know what they're looking at.
- **Why** — the reason this change exists at all. Pull this from commit messages, a linked issue, or the existing description if it already states intent; ask the user only if truly nothing in the branch indicates the motivation. Why is the *reason*, not a rephrasing of What — don't let it collapse into "because we changed X."

Keep both sections short. A trivial, single-purpose PR deserves one bullet per section, not padding to look thorough.

**Resources** — one more section, only when there's actually something to put in it:

- The issue this PR tracks, wherever it lives — a GitHub issue, a Jira ticket, a Linear issue, etc. Pull it from a `Fixes #123`/`Relates to <KEY>`-style reference already in a commit message or the existing PR body, the branch name, or what the user has already mentioned in conversation.
- Any external context that actually informed the fix — an upstream issue, a design doc, a blog post, a Miro board — again only if one genuinely exists in the branch's history or conversation.

Don't go hunting for tangential links to fill this out, and don't add a "Resources" section with nothing real in it. One line per link is plenty — this is a pointer, not a bibliography. If neither an issue link nor any external context exists, leave the section out entirely rather than forcing an empty one.

## Step 5: Fit the update into the existing template — don't replace it

Check the PR's current body and, if present, `.github/pull_request_template.md` (or `PULL_REQUEST_TEMPLATE.md`). If the repo has its own section headers — "## Summary", "## Testing", "## Screenshots", a checklist, a "Related issue(s)" field — map What/Why/Resources onto whichever existing headers are the closest match instead of inventing new ones, and leave every section you have no new information for untouched (testing notes, screenshots, checklists). If there's no template to work from, default to:

```markdown
## What
- ...

## Why
- ...

## Resources
- ...
```

(omit the `## Resources` section entirely when Step 4 found nothing to put there)

The goal is a description that reads like it was written by the person who made the change, not one that got its structure bulldozed by a script.

## Step 6: Apply it

```bash
gh pr edit <number> --title "<new title>" --body "<new body>"
```

If a changeset file was created or edited, it's part of the PR, not a side effect — but it's never bundled into the same commit as the implementation change either. Commit it separately, immediately after the commit it documents (don't let it drift to the end of a longer session, and don't let unrelated commits land between the fix and its changeset):

```bash
git add .changeset/*.md
git commit -m "chore: update changeset"
git push
```

If the implementation commit that prompted this changeset already has other commits stacked after it (e.g. this sync is catching up on a few rounds of pushes), the changeset commit still only needs to exist once, right after the fix — don't reorder existing history to force it earlier; that's not worth a rebase on someone else's branch.

Then tell the user, briefly: whether the title changed, and a one-line summary of what moved in the description/changeset. Don't paste the full new PR body back at them — they can open the PR to read it.

## When to touch nothing

- No open PR on the branch → skip, say so, stop. This skill never opens a PR.
- No diff since the PR's base → say it's already current, don't force an edit.
- No changeset tooling in the repo → don't add one; that's outside this skill's scope.
