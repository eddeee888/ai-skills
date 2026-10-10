---
name: pr-start
description: 'Turn a confirmed task into a pushed draft PR: profile the repo, confirm a task card (goal, why, done-when, scope, approach), hand the change to one sidekick fix loop, sweep it against remembered rules, then push and open a draft PR. Takes an issue, spec file, or plain-text ask. Slash-only: /cops:pr-start.'
disable-model-invocation: true
---

# Start a PR from a task

A new PR is only as good as the task it starts from. This skill pins the task down on a card the user confirms, then runs one scoped loop — implement, test, commit — checks it against remembered review rules, and opens a draft PR that says why it exists. It never continues an existing PR.

GitHub steps below are `gh` commands. Pick and keep one access route exactly as `CONVENTIONS-github.md` → "GitHub access" says.

## Where the task comes from

Read these, in order:

1. **The command argument.** An issue URL or number (any repository), a path to a spec or plan file, or a plain-text ask. A PR URL → stop and point to `/cops:pr-address` (review feedback) or `/cops:pr-sync` (stale description, rebase).
2. **The conversation so far.**
3. **What those link to** — issue threads, linked PRs, cited docs — read through the same GitHub route.

The oracle supplies the repo profile and remembered rules, never intent. Nothing states a reason for the change → ask the user; never guess one.

## 1. Gate

```bash
git rev-parse --show-toplevel
git branch --show-current
gh repo view --json nameWithOwner,defaultBranchRef
gh pr view --json number,url,state 2>&1
gh api user --jq .login
```

On the MCP route, find an open PR with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`) and the login with `get_me`.

- No checkout, or a detached HEAD → stop; say what's missing.
- The current branch already has an open PR → stop and point to `/cops:pr-address` or `/cops:pr-sync`.
- On the default branch → this run needs a new branch named `<type>/<short-slug>` (`CONVENTIONS-pr-metadata.md` → "Non-issue branch naming"). Propose it on the card in Step 3; never commit to the default branch.
- Uncommitted changes you didn't make → ask whether they belong to this task before going on.

Keep the login for trailers and the card's `Approved-by:`.

## 2. Profile and brief

Draft the card's Goal and the files it likely touches from the task sources. Then make one call to `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, in `scout-repo` + `brief-task` mode with `for: pr-sidekick` (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Pass owner/repo, that it is checked out, the draft Goal as the ask, the likely files, `login:`, and `memory-root:` / `memory-login:` from session context.

Keep from the reply: the profile (test command, monorepo packages, template, `overrides:`), the brief lines for `Rules that apply:`, and any `caller only:` lines. Apply `caller only:` lines yourself in this chat; never paste them into the sidekick prompt. Show any `memory-candidate:` lines at Step 7.

## 3. Task card

This is a hard gate. Ask with the card as one question (`CONVENTIONS-posts.md` → "Approving drafts: one question per item"), else show it; wait for the user to confirm or edit it. Nothing is edited, run or delegated before the user confirms the card.

```text
Task card
Goal: <one line>
Why: <one line> — <link to the source, or "stated in chat">
Done when: <a test that should pass | an observable behavior>
In scope:
- <what the change may touch>
Out of scope:
- <nearby things it must leave alone>
Approach: <one approach, in a line or two>
Branch: <current branch | new <type>/<short-slug> from <default branch>>
Confirm, or edit any line.
```

- **Bug** → Done when is "this failing test passes: <test name or behavior>". The fix loop writes that test first and confirms it fails for the reported reason before changing code.
- **Scope bullets** exist to keep the sidekick from drifting; make them concrete (files, packages, behaviors), not "be careful".
- **Options instead of one approach** only when the direction is unclear or the user asks. Give 2–3, each as:

  ```text
  Option <A>: <one-line name>
    Changes: <files or packages and what changes in each>
    Blast radius: <who or what else sees the change>
    Risk: <what could break, and how likely>
    Effort: <rough size — a few lines | one file | several files>
  ```

  The user picks one; the card's Approach becomes that option.
- Never suggest or hand off to another plugin's skill from the card.

An edit to Goal or likely files that changes what the brief covers → call `brief-task` again before Step 4. Once confirmed, create the new branch if the card named one (`git switch -c <type>/<short-slug>`). Branch declined → stop.

## 4. Fix loop

Read [fix-loop.md](fix-loop.md) now. Hand the loop to `pr-sidekick` (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent") in one handoff carrying the card's Goal, Approach, scope and Done when, `Rules that apply:` from the brief, the profile's test command, at most 3 attempts, and a commit with this skill's trailers. The sidekick never pushes.

A question back → ask the user, then respawn with `Resuming:` filled in. Failure after 3 attempts → stop; the work stays uncommitted for the user.

## 5. Sweep

Call `pr-oracle` in `sweep-diff` mode over the new commits, from the commit before the loop through `HEAD` (pass `memory-root:` / `memory-login:` again).

- `clean` → Step 6.
- In-scope flags → exactly one follow-up sidekick handoff with only those flags and the commit SHAs (template in fix-loop.md). It commits and does not push. Then run one more `sweep-diff` over that commit: `clean` → Step 6; any flag → stop and bring it to the user, no second follow-up.
- A flag outside the card's scope → bring it to the user; don't widen the PR.

Nothing is pushed before a clean `sweep-diff`: every pushed commit, the follow-up's included, has passed a sweep.

## 6. Push and open the PR

```bash
git push -u origin <branch>
d="$(git rev-parse --git-dir)"
gh pr create --draft --base <default branch> --title "$(cat "$d/pr-start-title.txt")" --body-file "$d/pr-start-body.md"
rm "$d/pr-start-title.txt" "$d/pr-start-body.md"
```

On the MCP route, call `create_pull_request` with `draft: true` and the two files' contents.

- **Title:** conventional prefix matching the branch type, imperative, net effect. Monorepo → `[package-name]` prefix (`CONVENTIONS-pr-metadata.md` → "Monorepo title prefix"). An issue in this repo → end with `(#123)` (`CONVENTIONS-pr-metadata.md` → "Trailing issue reference").
- **Body:** fit the profile's template headers; otherwise `## Why` (opens with `This PR ...`, carrying the card's Why), `## What`, `## Verification` (the Done when check and its result), and `## Resources` with the task source. An issue is referenced non-closing, `Relates to #123` or `Relates to owner/repo#123` (`CONVENTIONS-pr-metadata.md` → "Non-closing issue references"); a spec file or chat ask is named in a line. Write the files with `CONVENTIONS-github.md` → "Passing drafted text to `gh`".

## 7. Wrap up

Report the PR link, the commits, and the Done when result. Show `memory-candidate:` lines and ask whether to save them; only an explicit "remember this" permits a separate `learn-feedback` call. Don't run another skill; suggest `/cops:pr-note` per `CONVENTIONS-orchestration.md` → "Suggesting next steps" — the PR body now carries the task source it needs. End with `CONVENTIONS-orchestration.md` → "Handoffs in the final report", labels `scout-repo + brief-task`, `fix loop` (a second `fix loop` for a sweep follow-up), `sweep-diff` (a second `sweep-diff` for the follow-up's commit), and `learn-feedback` when run.

## Stop instead of proceeding

- The card isn't confirmed, or the Why has no source and the user hasn't given one.
- The current branch is the default branch and the user declines a new branch.
- The sidekick returns a question (ask, then resume) or fails after 3 attempts — leave the work uncommitted and bring it to the user.
- `sweep-diff` flags something outside the card's scope — don't widen the PR.
- The change needs a public API, security, auth, or infrastructure decision the card didn't name.

## Other rules

- **One editing subagent at a time**, never parallel, on the shared checkout.
- **No subagent capability** → run the fix loop inline from fix-loop.md and mark it `inline (no subagent capability)` in `Handoffs:`.
- **Memory** is written only by a separate `learn-feedback` call after an explicit "remember this"; operational oracle calls never write it.
- **Commits** carry `Skill: cops:pr-start` and `Approved-by: <login>`, since the user confirmed the card (`CONVENTIONS-pr-metadata.md` → "Commit trailers").
