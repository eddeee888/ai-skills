# pr-sync: Steps 2–6

Read by the subagent `SKILL.md` hands these steps to (or the main chat when there's no subagent). The oracle's profile (`scout-repo`) and brief (`brief-task`) come in your prompt — don't call the oracle yourself. Where a step says to ask the user or hand something to them, return it as your question instead.

`Resuming:` not `no` → it carries your earlier question and the user's answer. Check what's done — `git status -sb` against `origin/<headRefName>`, whether the changeset commit exists — and pick up at the step that asked, using the answer. Don't rebase, commit or push again what's already on origin.

## Step 2: Rebase onto the base branch

```bash
git fetch origin <baseRefName> --quiet
git rebase origin/<baseRefName>
```

Only on a branch that's yours alone — unsure → ask first; rebasing under a collaborator loses their work on their next pull.

Clean → continue without pushing; Step 4 pushes once, after any changeset commit, so CI runs once.

Conflicts → stop. Resolve only obvious ones (same file, clearly compatible changes on both sides); otherwise hand them to the user with what conflicts and why. Never force through with `--skip` or a guessed resolution.

## Step 3: Look at what changed

```bash
git diff origin/<baseRefName>...HEAD --stat
git log origin/<baseRefName>..HEAD --format='%h %s%n%b'
gh pr view <number> --json body --jq .body
```

Your prompt says `GitHub: MCP` → read the body with `pull_request_read` method `get` instead.

Start from the file list, commit messages, and current PR body — they often state the *why*; use them rather than guessing from the diff. Then diff only the files needed to state the behavior change (`git diff origin/<baseRefName>...HEAD -- <path>`), not the whole PR: the full diff can run to tens of thousands of tokens that stay in context for every later step, and Step 7's `grill-description` reads all of it anyway.

Empty diff → the PR is already current; say so and stop.

## Step 4: Check for a changeset, only if the repo uses one

Use the profile: its `changesets` line answers this step, its monorepo line Step 5's title prefix, its template line Step 6's headers. No profile → check each inline as written.

Without a profile, look for `.changeset/config.json` or an equivalent in use. Neither → skip the changeset (still push, below); don't introduce a changelog convention as a side effect of a sync.

If present:
- A changeset for this branch exists → update its summary to match the current diff.
- None → create one, matching the profile's bump style. No profile → read one or two recent entries in `.changeset/`, not all.

The changeset always gets its own commit, never squashed into an implementation commit:

```bash
git add .changeset/*.md
git commit -m "chore: update changeset"
```

Other commits already after the implementation commit (catching up on several rounds of pushes) → the changeset commit still exists once; don't reorder history to force it earlier.

Then push once, changeset or not — rebase and any changeset commit together:

```bash
git push --force-with-lease
```

## Step 5: Draft the title and description

The brief says how the user likes descriptions written and what their reviewers keep asking for. Draft to it; where it conflicts with the rules below, the rules win — except a rule pointing to a *Default* section of `CONVENTIONS.md`, which the profile's `overrides:` line and the brief can override (`CONVENTIONS.md` → "Defaults and contracts").

**Title** — one line naming the net effect of the change, imperative after any type prefix. Keep an existing conventional-commit prefix (`fix:`, `test:`, …), updating it when the change's kind changed: a checkpoint PR that now carries its fix goes from `test: reproduce … (failing)` to `fix: …`, dropping `(failing)`. Diff bundles unrelated things → name the most user-visible one, don't cram. Monorepo → apply the shared `[package-name]` prefix (`CONVENTIONS.md` → "Monorepo title prefix"). Title ends in a `(#123)`-style issue reference → keep it in the same form (`CONVENTIONS.md` → "Trailing issue reference"); a resync must not silently drop it.

**Description** — three required sections, in this order, kept tight — a PR body a reviewer skims, not a design doc:

- **Why** — the reason this change exists, not a rephrasing of What. Pull it from commit messages, a linked issue, or the existing description; ask the user only if nothing indicates the motivation. Must open with a paragraph starting `This PR ...` stating the mechanism by which it solves the issue, not just what the issue was — motivation bullets can follow.
- **What** — the concrete change in a few short bullets: files, behavior, APIs touched — specific enough that a reviewer needn't open the diff to know what they're looking at.
- **Verification** — how a reader can trust the change works: tests added/updated, commands run and their result, manual steps (with observed outcome), or covering CI checks. Pull it from commit messages, test files, and the diff; ask the user only if the branch gives no indication. No "should work" padding — nothing verified → say so plainly. A check that already ran in CI gets named by test type, not the literal command (`CONVENTIONS.md` → "Verification checklist"). Tests failing on purpose — a checkpoint commit with no fix yet — get stated plainly, never checklisted as passing (`CONVENTIONS.md` → "Don't checklist an intentionally-failing check as done").

One bullet per section is enough for a trivial PR; don't pad. In each section, bold the one claim that matters in a bullet — the causal reason, the chosen rationale, a caveat (`CONVENTIONS.md` → "Bold the critical claim"); skip a bullet with nothing critical enough to call out.

**Resources** — one more section, only when there's something to put in it:

- The issue this PR tracks, wherever it lives. Pull it from an existing `Fixes #123`/`Relates to <KEY>`-style reference in a commit message or the PR body, the branch name, or the conversation. Preserve whichever keyword is in use, closing or non-closing — never normalize one to the other while rewriting; whether the PR closes the issue on merge isn't a resync's call (`CONVENTIONS.md` → "Non-closing issue references").
- External context that informed the fix — an upstream issue, a design doc, a blog post — only if one genuinely exists.

Don't hunt for tangential links. One line per link. Neither an issue link nor external context → leave the section out.

## Step 6: Fit the update into the existing template — don't replace it

Check the PR's current body (from Step 3) and the profile's template headers; read `.github/pull_request_template.md` (or `PULL_REQUEST_TEMPLATE.md`) only when there's no profile. Repo has its own headers — "Summary", "Testing", "How it was tested", "Screenshots", a checklist → map Why/What/Verification/Resources onto the closest existing header instead of inventing new ones. Verification usually has a home ("Testing", "Test plan", "QA steps"); add a standalone "## Verification" only if nothing fits. Leave sections you have no new information for untouched. No template to work from → default to:

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

(omit `## Resources` when Step 5 found nothing for it)

The goal: a description that reads as written by the person who made the change, not bulldozed by a script.
