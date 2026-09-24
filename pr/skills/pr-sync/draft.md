# pr-sync: Steps 2–6

Read by the subagent `SKILL.md` hands these steps to (or by the main chat when there's no subagent). The sidekick's `profile` and `brief` come in your prompt — don't call the sidekick yourself. Where a step says to ask the user or hand something to them, return it as your question instead.

## Step 2: Rebase onto the base branch

```bash
git fetch origin <baseRefName> --quiet
git rebase origin/<baseRefName>
```

Only on a branch that's yours alone — ask first if you're not sure, since rebasing out from under a collaborator loses their work on their next pull.

Clean → continue without pushing; Step 4 pushes once, after any changeset commit, so CI runs once.

Conflicts → stop. Resolve only the obvious ones (same file, clearly compatible changes on both sides); otherwise hand them to the user with what's conflicting and why. Never force it through with `--skip` or a guessed resolution.

## Step 3: Look at what's actually changed

```bash
git diff origin/<baseRefName>...HEAD --stat
git log origin/<baseRefName>..HEAD --format='%h %s%n%b'
gh pr view <number> --json body --jq .body
```

Your prompt says `GitHub: MCP` → read the body with `pull_request_read` method `get` instead.

Start from the file list, the commit messages, and the current PR body — they often already state the *why*; use them rather than guessing from the diff alone. Then read the diff of only the files you need to state the behavior change (`git diff origin/<baseRefName>...HEAD -- <path>`), not the whole PR. The full diff can be tens of thousands of tokens and would stay in context for every later step; Step 7's `check-description` reads all of it anyway.

Empty diff → the PR is already current; say so and stop.

## Step 4: Check for a changeset, but only if the repo actually uses one

Use the `profile` you were given: its `changesets` line answers this step, its monorepo line answers Step 5's title prefix, and its template line answers Step 6's headers. No profile → check each inline as written.

Without a profile, look for `.changeset/config.json` or an equivalent already in use. Neither exists → skip the changeset part (but still push, below); don't introduce a changelog convention as a side effect of a sync task.

If present:
- A changeset file already exists for this branch → update its summary to match the current diff.
- None exists → create one, matching the bump style the profile reports. No profile → read one or two recent entries in `.changeset/`, not all of them.

The changeset always gets its own commit, never squashed into an implementation commit:

```bash
git add .changeset/*.md
git commit -m "chore: update changeset"
```

If other commits already sit after the implementation commit (this sync is catching up on a few rounds of pushes), the changeset commit still only needs to exist once — don't reorder existing history to force it earlier.

Then push once, changeset or not — the rebase and any changeset commit together:

```bash
git push --force-with-lease
```

## Step 5: Draft the title and description

The `brief` you were given says how the user likes descriptions written and what their reviewers keep asking to see in them. Draft to it where it doesn't conflict with the rules below; where it does, the rules below win.

**Title** — one line, imperative, naming the net effect of the change. If the diff bundles a few unrelated things, name the most user-visible one rather than cramming everything in. Monorepo → apply the shared `[package-name]` prefix (`CONVENTIONS.md` → "Monorepo title prefix"). Title already ends in a trailing `(#123)`-style issue reference → keep it, in the same form (`CONVENTIONS.md` → "Trailing issue reference"); don't let a resync silently drop it.

**Description** — three required sections, in this order, kept tight, since this is a PR body a reviewer skims, not a design doc:

- **Why** — the reason this change exists at all. Pull it from commit messages, a linked issue, or the existing description if it already states intent; ask the user only if nothing indicates the motivation. Why is the *reason*, not a rephrasing of What. Must open with a paragraph starting `This PR ...` stating the mechanism by which it solves the issue, not just what the issue was — motivation bullets can follow.
- **What** — the concrete change, as a few short bullets: files, behavior, APIs touched. Specific enough that a reviewer doesn't have to open the diff to know what they're looking at.
- **Verification** — how a reader can trust the change actually works: tests added/updated, commands run and their result, manual steps (with the observed outcome), or CI checks that cover it. Pull this from commit messages, test files, and the diff; ask the user only if the branch gives no indication. Don't pad with "should work" — if nothing was verified, say that plainly. A check that already ran in CI gets named by test type, not the literal command (`CONVENTIONS.md` → "Verification checklist"). Tests failing on purpose — a checkpoint commit with no fix yet — get stated plainly, never checklisted as passing (`CONVENTIONS.md` → "Don't checklist an intentionally-failing check as done").

Keep all three sections short — one bullet per section is enough for a trivial PR, not padding to look thorough. In each section, bold the one claim that matters in a bullet — the causal reason, the chosen rationale, a caveat (`CONVENTIONS.md` → "Bold the critical claim"); skip a bullet with nothing critical enough to call out.

**Resources** — one more section, only when there's actually something to put in it:

- The issue this PR tracks, wherever it lives. Pull it from an existing `Fixes #123`/`Relates to <KEY>`-style reference in a commit message or the PR body, the branch name, or the conversation. Preserve whichever keyword is already in use, closing or non-closing — never normalize one to the other as a side effect of rewriting this section; whether the PR should close the issue on merge isn't a resync's call to make (`CONVENTIONS.md` → "Non-closing issue references").
- Any external context that actually informed the fix — an upstream issue, a design doc, a blog post — only if one genuinely exists.

Don't go hunting for tangential links, and don't add a "Resources" section with nothing real in it. One line per link is plenty. Leave the section out entirely if neither an issue link nor external context exists.

## Step 6: Fit the update into the existing template — don't replace it

Check the PR's current body (from Step 3) and the template headers from the profile; read `.github/pull_request_template.md` (or `PULL_REQUEST_TEMPLATE.md`) itself only when there's no profile. If the repo has its own headers — "Summary", "Testing", "How it was tested", "Screenshots", a checklist — map Why/What/Verification/Resources onto whichever existing header is the closest match instead of inventing new ones. Verification almost always has a home already ("Testing", "Test plan", "QA steps") — ease it in there; only add a standalone "## Verification" if nothing fits. Leave every section you have no new information for untouched. No template to work from → default to:

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
