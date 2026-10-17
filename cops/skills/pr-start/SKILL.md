---
name: pr-start
description: 'Turn a confirmed task into a pushed draft PR: profile the repo, confirm a task card (goal, why, done-when, scope, approach), hand the change to one sidekick fix loop, sweep it against remembered rules, then push and open a draft PR. Takes an issue, spec file, or plain-text ask; `--autopilot` carries it on to a finished draft. Slash-only: /cops:pr-start.'
disable-model-invocation: true
---

# Start a PR from a task

GitHub steps below are `gh` commands. Pick and keep one access route as `CONVENTIONS-github.md` → "GitHub access" says.

## Where the task comes from

Read, in order:

1. **The command argument.** An issue URL or number (any repository), a spec or plan file path, or a plain-text ask. A PR URL → stop and point to `/cops:pr-address` or `/cops:pr-sync`. A leading `--autopilot [<login>]` is a flag, not the task.
2. **The conversation so far.**
3. **What those link to** — issue threads, linked PRs, cited docs — read through the same GitHub route.

The oracle supplies the repo profile and remembered rules, never intent. No stated reason → ask the user.

## 1. Gate

```bash
git rev-parse --show-toplevel
git branch --show-current
gh repo view --json nameWithOwner,defaultBranchRef
gh pr view --json number,url,state 2>&1
gh api user --jq .login
```

MCP route: find an open PR with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`) and the login with `get_me`.

- No checkout, or a detached HEAD → stop; say what's missing.
- The current branch already has an open PR → stop and point to `/cops:pr-address` or `/cops:pr-sync`.
- On the default branch → propose a new `<type>/<short-slug>` branch on the card (`CONVENTIONS-pr-metadata.md` → "Non-issue branch naming"); never commit to the default branch.
- Uncommitted changes you didn't make → ask whether they belong here.
- `--autopilot` → read [autopilot.md](autopilot.md) now; a failed gate check there refuses autopilot and offers the normal run.

Keep the login for trailers and `Approved-by:`.

## 2. Profile and brief

From the task sources, draft the card's Goal and likely files. Then call `cops:pr-oracle` once (Cursor: the `pr-oracle` subagent) in `scout-repo` + `brief-task` mode with `for: pr-sidekick` and `for: task-card` (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Pass owner/repo, that it's checked out, the draft Goal as the ask, likely files, `login:`, `GitHub route:`, and `memory-root:` / `memory-login:` from session context.

Keep from the reply the profile (test command, monorepo packages, template, `evidence:`, `overrides:`), the brief lines for `Rules that apply:`, the brief's `Evidence:` line for the card (never a rule line), and any `caller only:` lines, which you apply here and never paste into the sidekick prompt.

## 3. Task card

This is a hard gate. Ask with the card as one question (`CONVENTIONS-posts.md` → "Approving drafts: one question per item"), else show it; wait for the user to confirm or edit it. Nothing is edited, run or delegated before the user confirms the card.

```text
Task card
Goal: <one line>
Why: <one line> — <link to the source, or "stated in chat">
Done when: <a test that should pass | an observable behavior>
Evidence: <kind> — <scenario>, <scenario> (before/after) | none — <why>
In scope:
- <what the change may touch>
Out of scope:
- <nearby things it must leave alone>
Approach: <one approach, in a line or two>
Size: <Small|Medium|Large> — <reason>
Branch: <current branch | new <type>/<short-slug> from <default branch>>
Confirm, or edit any line.
```

- **Bug** → Done when is "this failing test passes: <test name or behavior>". The fix loop writes that test first and confirms it fails for the reported reason before changing code.
- **Evidence** (required) → the brief's `Evidence:` line (`CONVENTIONS-evidence.md` → "Evidence scenarios"), always present, as scenarios or `none — <why>`. An edit stands; it doesn't re-run `brief-task`. Shown in the PR body.
- **Size** → read [size.md](size.md) now (`CONVENTIONS-pr-metadata.md` → "Task size"). It gates only autopilot.
- **Autopilot** → with the flag, or without it on a Small or Medium card, read [autopilot.md](autopilot.md) before showing the card: it refuses a Large or high-risk card, and adds the card's authorised outward actions line or the confirm screen's offer.
- **Scope bullets** stop sidekick drift; make them concrete (files, packages, behaviors).
- **Options instead of one approach** only when the direction is unclear or the user asks. Give 2–3, each as:

  ```text
  Option <A>: <one-line name>
    Changes: <files or packages and what changes in each>
    Affects: <who or what else sees the change>
    Risk: <what could break, and how likely>
    Effort: <rough size — a few lines | one file | several files>
    Size: <Small|Medium|Large> — <reason>
  ```

  The card's Approach and Size become the picked option's.
- Never suggest or hand off to another plugin's skill from the card.

A Goal or likely-files edit that changes what the brief covers → rerun `brief-task` before Step 4. Once confirmed, create any new branch the card names (`git switch -c <type>/<short-slug>`).

## 4. Fix loop

Read [fix-loop.md](fix-loop.md) now. Scenarios → `before` capture first. Hand the loop to `pr-sidekick` (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent") in one handoff carrying the card's Goal, Approach, scope and Done when, `Rules that apply:` from the brief, the profile's test command, at most 3 attempts, and a commit with this skill's trailers. The sidekick never pushes.

A question back → ask the user, then respawn with `Resuming:`; in autopilot it stops the run. Failure after 3 attempts leaves the work uncommitted.

## 5. Sweep

Call `pr-oracle` in `sweep-diff` mode over the new commits (pre-loop commit to `HEAD`; pass `GitHub route:`, `memory-root:` / `memory-login:` again).

- `clean` → Step 6.
- In-scope flags → exactly one follow-up sidekick handoff with only those flags and the commit SHAs (template in fix-loop.md). It commits, never pushes. Then one more `sweep-diff` over that commit: `clean` → Step 6; any flag → stop, bring it to the user; no second follow-up.
- A flag outside the card's scope → bring it to the user; don't widen the PR.

Nothing is pushed before a clean `sweep-diff`.

## 5b. Write the evidence manifest

Write the `<details>` manifest block (`CONVENTIONS-evidence.md`) for the body. Nothing is pushed for evidence.

## 6. Push and open the PR

```bash
git push -u origin <branch>
d="$(git rev-parse --git-dir)"
gh pr create --draft --base <default branch> --title "$(cat "$d/pr-start-title.txt")" --body-file "$d/pr-start-body.md"
rm "$d/pr-start-title.txt" "$d/pr-start-body.md"
```

MCP route: `create_pull_request` with `draft: true` and the two files' contents. Autopilot adds its label and body banner (autopilot.md).

- **Title:** conventional prefix matching the branch type, imperative, net effect. Monorepo → `[package-name]` prefix (`CONVENTIONS-pr-metadata.md` → "Monorepo title prefix"). An issue in this repo → end with `(#123)` (`CONVENTIONS-pr-metadata.md` → "Trailing issue reference").
- **Body:** fit the profile's template headers; otherwise `## Why` (opens with `This PR ...`, carrying the card's Why), `## What`, `## Verification` (Done when check, result: `CONVENTIONS-verification.md` → "Verification checklist"; scenarios → `### Before` then `### After` under it, as in `CONVENTIONS-verification.md` → "Before and After"; Before is taken at the base; evidence never holds the PR), and `## Resources` with the task source. An issue is referenced non-closing, `Relates to #123` or `Relates to owner/repo#123` (`CONVENTIONS-pr-metadata.md` → "Non-closing issue references"); a spec file or chat ask is named in a line. Write the files with `CONVENTIONS-github.md` → "Passing drafted text to `gh`".

## 7. Wrap up

Report the PR link, commits, Done when result and a raised Size (fix-loop.md). Show `memory-candidate:` lines, asking whether to save them; only an explicit "remember this" permits a separate `learn-feedback` call. Autopilot → before reporting, run autopilot.md's chain, finish and stops. Otherwise don't run another skill; suggest `/cops:pr-review`, then `/cops:pr-note`, per `CONVENTIONS-orchestration.md` → "Suggesting next steps". End with `CONVENTIONS-orchestration.md` → "Handoffs in the final report", labels `scout-repo + brief-task`, `fix loop` (a second for a sweep follow-up), `sweep-diff` (a second for the follow-up's commit), and `learn-feedback` when run.

## Stop instead of proceeding

- The card isn't confirmed, or the Why has no source and the user hasn't given one.
- On the default branch and the user declines a new branch.
- The sidekick fails after 3 attempts, or `sweep-diff` flags something outside the card's scope.
- The change needs a public API, security, auth, or infrastructure decision the card didn't name.

## Other rules

- **One editing subagent at a time**, never parallel, on the shared checkout.
- **Commits** carry `Skill: cops:pr-start` and `Approved-by: <login>`, since the user confirmed the card (`CONVENTIONS-pr-metadata.md` → "Commit trailers").
