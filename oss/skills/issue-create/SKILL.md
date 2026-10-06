---
name: issue-create
description: Draft and file a well-formed bug-report issue on a GitHub repo, covering Context, Problem, Reproduction, and any specific environments — mapped onto the repo's own issue template where one exists. Use when asked to "file an issue", "open an issue on <repo>", "report this bug upstream", "draft a bug report for <repo>", or when a bug surfaces mid-conversation that belongs on a repo the user doesn't maintain here. Always asks for the target repo first and always shows the drafted issue for confirmation before creating it — never posts to GitHub without that confirmation. Pairs with the `issue-verify` skill, which can pick up the issue once it's filed.
---

# Create a GitHub issue

A bug report missing context, a clear problem statement, a reproduction, or its environment bounces back with "can you provide more details", costing a round trip. This skill drafts a complete report against four sections before anything is posted, and never files anything the user hasn't seen.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Ask for the repo

Always ask which repo the issue is for (`owner/repo` or a full GitHub URL) before anything else. Don't assume the current session's repo; a bug found while working on one repo often belongs on a dependency's.

## Step 2: Check for a duplicate

```bash
gh issue list --repo <owner>/<repo> --search "<keywords>" --state all
```

Close match → show it and ask whether to proceed anyway. Nothing close → continue.

## Step 3: Fetch that repo's issue template, if it has one

`cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, available (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent") → get the target repo's profile (`scout-repo`); it doesn't need to be checked out. It names the bug-report template and its required fields, and flags contribution rules that bind an issue — fetch only that template's full text. It couldn't tell which template is the bug report → handle it as below. Not available → look it up inline:

```bash
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE --jq '.[].name' 2>/dev/null
```

Pick the bug-report one from the names (e.g. `bug_report.md` over `feature_request.md`); ambiguous → ask the user. Fetch only that file, as raw text rather than base64 JSON:

```bash
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE/<file> -H 'Accept: application/vnd.github.raw'
```

No `.github/ISSUE_TEMPLATE/` → check for a plain `.github/ISSUE_TEMPLATE.md`. Neither → use the four sections below as-is.

## Step 4: Gather the four sections

From the conversation, asking the user for whatever's missing:

- **Context** — what the user was doing, what setup/usage led here.
- **Problem** — expected vs. actual behavior, stated plainly.
- **Reproduction** — concrete steps, a minimal code sample, or a link to a live repro (CodeSandbox/StackBlitz/a small repo). Vague steps ("it breaks sometimes") aren't a reproduction — push for something concrete.
- **Any specific environments** — versions, OS, browser, runtime, or "reproduces on all environments tested" if so.

Don't fabricate detail for a section nobody provided — ask, or mark it explicitly as unknown.

## Step 5: Draft the issue, fitting the repo's template

**Template exists:** map Context/Problem/Reproduction/Environment onto its headers/fields by closest match; don't invent new ones. Keep every required field, even empty ones (mark them clearly rather than deleting) — a missing required field on a form-based template can make submission fail.

**No template:** default to:

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

Draft a title too: one specific line naming the actual behavior (not "bug in X" — say what's wrong).

## Step 6: Show the draft, get confirmation

Show the full drafted title and body verbatim before touching GitHub. This is a hard gate, not a formality — apply requested edits and show the result again if it changed materially. Move to Step 7 only once they've explicitly confirmed it's ready to post.

## Step 7: Create it

End the body with the `oss:issue-create` signature and the `✓ <login>` approval — the user confirmed it (`CONVENTIONS.md` → "Skill signature"). Write the confirmed title and body to files first — never inline them in `--title "…"`/`--body "…"`, where backticks in a bug report's code run as shell commands (`CONVENTIONS.md` → "Passing drafted text to `gh`"):

```bash
gh issue create --repo <owner>/<repo> --title "$(cat <title-file>)" --body-file <body-file>
```

Report the issue URL, and end with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with the label `scout-repo`. Verifying the issue (writing a failing test against it) is `issue-verify`'s job, if the user wants to go further. If the user doesn't maintain `<owner>/<repo>` or have a local checkout, say so plainly — `issue-verify` assumes write access and a local checkout; without them, the issue waits on its own maintainers.

## When to stop instead of proceeding

- No repo given yet → ask before anything else; don't guess from context.
- Reproduction missing or too vague → push back for a concrete one in Step 4 rather than drafting around the gap.
- User hasn't confirmed the draft → never run `gh issue create`, even if every section looks filled in.
- Multiple templates and unclear which fits → ask; don't default to the first alphabetically.
