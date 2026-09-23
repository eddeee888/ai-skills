---
name: issue-create
description: Draft and file a well-formed bug-report issue on a GitHub repo, covering Context, Problem, Reproduction, and any specific environments — mapped onto the repo's own issue template where one exists. Use when asked to "file an issue", "open an issue on <repo>", "report this bug upstream", "draft a bug report for <repo>", or when a bug surfaces mid-conversation that belongs on a repo the user doesn't maintain here. Always asks for the target repo first and always shows the drafted issue for confirmation before creating it — never posts to GitHub without that confirmation. Pairs with the `issue-verify` skill, which can pick up the issue once it's filed.
---

# Create a GitHub issue

A bug report that's missing context, a clear problem statement, a reproduction, or the environment it happened in just bounces back with "can you provide more details" — costing a round trip before anyone can act on it. This skill front-loads that: it drafts a complete report against four sections before anything is posted, and never files anything the user hasn't seen first.

## Step 1: Ask for the repo

This skill isn't scoped to one repo — always ask which one the issue is for (`owner/repo` or a full GitHub URL) before doing anything else. Don't assume it's the repo the current session happens to be in; a bug found while working on one repo often belongs on a dependency's repo instead.

## Step 2: Check for a duplicate

```bash
gh issue list --repo <owner>/<repo> --search "<keywords>" --state all
```

Found a close match → show it to the user and ask whether to proceed anyway. Nothing close → continue.

## Step 3: Fetch that repo's issue template, if it has one

`pr:pr-sidekick` available (`CONVENTIONS.md`) → get a `profile` of the target repo; it doesn't need to be checked out. It names the bug-report template and its required fields, and flags contribution rules that bind an issue — fetch just that one template's full text. If it couldn't tell which template is the bug report, handle it as below. Not available → look it up inline:

```bash
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE 2>/dev/null
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE/config.yml 2>/dev/null
```

Pull down whatever templates exist. More than one (e.g. `bug_report.md` and `feature_request.md`) → pick the one meant for bug reports; ask the user if it's genuinely ambiguous which one applies.

No `.github/ISSUE_TEMPLATE/` at all → also check for a plain `.github/ISSUE_TEMPLATE.md`. Neither exists → proceed with the four sections below as-is.

## Step 4: Gather the four sections

Pull together, from the conversation so far and by asking the user for whatever's missing:

- **Context** — what the user was doing, what setup/usage led here.
- **Problem** — the actual bug: expected behavior vs. actual behavior, stated plainly.
- **Reproduction** — concrete steps, a minimal code sample, or a link to a live repro (CodeSandbox/StackBlitz/a small repo). Vague steps ("it breaks sometimes") aren't a reproduction — push for something concrete.
- **Any specific environments** — versions, OS, browser, runtime, or "reproduces on all environments tested" if genuinely so.

Don't fabricate detail for a section nobody's provided — ask, or leave it explicitly marked as unknown.

## Step 5: Draft the issue, fitting the repo's template

**If a template exists:** map Context/Problem/Reproduction/Environment onto its existing headers/fields by closest match instead of inventing new ones. Keep every field the template requires, even ones with no content (mark them clearly rather than deleting them) — a required field going missing on a form-based template can make submission fail outright.

**If no template exists:** default to:

```markdown
## Context
...

## Problem
...

## Reproduction
...

## Environment
...
```

Draft a title too: one line, specific, naming the actual behavior (not "bug in X" — say what's wrong).

## Step 6: Show the draft, get confirmation

Show the full drafted title and body back to the user, verbatim, before touching GitHub. Treat this as a hard gate, not a formality — apply any edits they ask for and show the result again if it changed materially. Only move to Step 7 once they've explicitly confirmed it's ready to post.

## Step 7: Create it

```bash
gh issue create --repo <owner>/<repo> --title "<confirmed title>" --body "<confirmed body>"
```

Report back the issue URL. Filing the issue is this skill's job; verifying it (writing a failing test against it) is `issue-verify`'s, and only once the repo maintainers have had a chance to weigh in. If `<owner>/<repo>` isn't a repo the user maintains or has a local checkout of, note that plainly — `issue-verify`'s pairing with this skill assumes write access and a local checkout of the target repo; without that, the issue just waits on its own maintainers.

## When to stop instead of proceeding

- No repo given yet → ask before doing anything else; don't guess a repo from context.
- A reproduction is missing or too vague → push back for a concrete one in Step 4 rather than drafting around a gap.
- User hasn't confirmed the draft → never run `gh issue create` on an unconfirmed draft, even if every section looks filled in.
- Multiple templates and it's unclear which fits → ask, don't default to the first one alphabetically.
