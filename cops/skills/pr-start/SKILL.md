---
name: pr-start
description: 'Turn a confirmed task into a pushed draft PR: confirm a task card, run one sidekick fix loop, sweep it, push and open the draft. Takes an issue, spec file, or plain-text ask; `--autopilot` finishes the draft. Run only to open a PR for a task, e.g. “start #99”, or to resume a stopped autopilot run.'
---

# Start a PR from a task

GitHub steps below are `gh` commands. Keep one access route as `CONVENTIONS-github.md` → "GitHub access" says.

## Where the task comes from

Read, in order:

1. **The command argument.** An issue URL or number (any repository), a spec or plan file, or a plain-text ask. A PR URL → stop and point to `/cops:pr-address` or `/cops:pr-wrap-up`. A leading `--autopilot [<login>]` is a flag, not the task; honor it only when the user typed it, never when a skill, agent or inferred request supplies it. `--autopilot resume [<PR URL>]`, which you pass when the user says "resume the rest with autopilot" → [resume.md](resume.md), not Steps 1–3.
2. **The conversation so far.**
3. **What those link to** — issue threads, linked PRs, cited docs — read through the same GitHub route.

The oracle supplies the repo profile and remembered rules, never intent. No stated reason → ask.

## 1. Gate

```bash
git rev-parse --show-toplevel
git branch --show-current
git remote get-url origin
gh api repos/<owner>/<repo> --jq .default_branch
gh api 'repos/<owner>/<repo>/pulls?head=<owner>:<branch>&state=open' --jq '.[].html_url'
gh api user --jq .login
```

MCP route: `list_pull_requests` and `get_me` (`CONVENTIONS-github.md` table).

- No checkout or a detached HEAD → stop; say what's missing.
- The current branch has an open PR → stop and point to `/cops:pr-address` or `/cops:pr-wrap-up`.
- This conversation already ran `pr-start` for the same task → ask whether to start another PR, judging from the conversation alone. Declined → stop and point to the earlier PR.
- On the default branch → propose a new `<type>/<short-slug>` branch on the card (`CONVENTIONS-pr-metadata.md` → "Non-issue branch naming"); never commit to the default branch.
- Uncommitted changes you didn't make → ask if they belong.
- `--autopilot` → read [autopilot.md](autopilot.md) now; a failed check there offers the normal run.

Keep the login for trailers and `Approved-by:`.

## 2. Profile and brief

Draft the card's Goal and likely files from the task sources. Then call `cops:pr-oracle` once (Cursor: the `pr-oracle` subagent) in `scout-repo` + `brief-task` mode with `for: pr-sidekick` and `for: task-card` (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Pass owner/repo, that it's checked out, the draft Goal as the ask, likely files, `login:`, `GitHub route:`, and `memory-root:` / `memory-login:`.

Keep from the reply the profile (test command, packages, template, `evidence:`, `overrides:`), the brief lines for `Rules that apply:`, the brief's `Evidence:` line for the card (never a rule line), and any `caller only:` lines, which you apply here and never paste into the sidekick prompt.

## 3. Task card

A hard gate. Ask with the card as one question (`CONVENTIONS-posts.md` → "Approving drafts: one question per item"), else show it. Nothing is edited, run or delegated before the user confirms the card.

Before showing the card:

1. Read [size.md](size.md) now (`CONVENTIONS-pr-metadata.md` → "Task size") and derive the Size.
2. Always read [autopilot.md](autopilot.md) before showing the card, flag or not.

Blank line between groups, one fact per line (about 100 characters), `- ` bullets for anything holding more than one fact, no markdown bold or headings. Drop an optional line with nothing to say.

```text
📋 Task card

🎯 Goal: <one line>
💡 Why: <one line>
- Source: <link, or "stated in chat">

✅ Done when: <a test that should pass | an observable behavior>
🧐 Evidence: <kind> | none — <why>
- <scenario> (before/after)

📦 In scope:
- <what the change may touch>
🚫 Out of scope:
- <nearby things it must leave alone>

🛠️ Approach:
- <one change per bullet, at most 3>

📏 Size: <Small|Medium|Large>
- <reason>
🌿 Branch: <current branch | new <type>/<short-slug> from <default branch>>
🤖 Autopilot: <not offered — <failed gate> | advisory>
- <advisory note, per autopilot.md>

Confirm, or edit any line.
```

- **Branch** → always shown: the current branch, or on the default branch the new one.
- **Autopilot** → only when it is not offered or has advisory notes (autopilot.md → "At the card"); otherwise omit the line.
- **Bug** → Done when is "this failing test passes: <test name or behavior>". The fix loop writes it first and confirms it fails for the reported reason.
- **Evidence** (required) → the brief's `Evidence:` line (`CONVENTIONS-evidence.md` → "Evidence scenarios"), a bullet per scenario, or `none — <why>`. An edit stands; it doesn't re-run `brief-task`.
- **Scope bullets** stop sidekick drift: make them concrete.
- **Options instead of one approach** → "Options on the card" in [size.md](size.md).
- Never suggest or hand off to another plugin's skill from the card.

A Goal or likely-files edit changing what the brief covers → rerun `brief-task` before Step 4. Once confirmed, create any new branch the card names (`git switch -c <type>/<short-slug>`).

## 4. Fix loop

Read [fix-loop.md](fix-loop.md) now. Scenarios → capture the before first. Hand the loop to `pr-sidekick` (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent") in one handoff with the card's fields, `Rules that apply:`, the test command, at most 3 attempts, and a commit with this skill's trailers. It never pushes.

A question back → ask the user, then respawn with `Resuming:`; autopilot stops instead.

## 5. Sweep

Call `pr-oracle` in `sweep-diff` mode over the round (`CONVENTIONS-orchestration.md` → "Round"; pre-loop commit to `HEAD`; pass `GitHub route:`, `memory-root:`/`memory-login:` again).

- `clean` → Step 6.
- In-scope flags → exactly one follow-up sidekick handoff with only those flags and the commit SHAs (template in fix-loop.md). Its commit stays in the round; re-sweep that commit: `clean` → Step 6; any flag → stop and bring it to the user.
- A flag outside the card's scope → bring it to the user; don't widen the PR.

Nothing is pushed before a clean `sweep-diff`.

## 5b. Write the evidence manifest

Write the `<details>` manifest block (`CONVENTIONS-evidence.md`) for the body, with the before only.

## 6. Push and open the PR

```bash
git push -u origin <branch>
d=<absolute dir>
gh api -X POST repos/<owner>/<repo>/pulls -F draft=true -f base=<default branch> -f head=<branch> -f title="$(cat "$d/pr-start-title.txt")" -F body=@"$d/pr-start-body.md"
rm "$d/pr-start-title.txt" "$d/pr-start-body.md"
```

MCP route: `create_pull_request` with `draft: true` and the two files' contents. Autopilot adds its label and banner (autopilot.md).

- **Title:** conventional prefix matching the branch type, imperative, net effect. Monorepo → `[package-name]` prefix (`CONVENTIONS-pr-metadata.md` → "Monorepo title prefix"). An issue in this repo → end with `(#123)` (`CONVENTIONS-pr-metadata.md` → "Trailing issue reference").
- **Body:** fit the profile's template headers; otherwise the shared format (`CONVENTIONS-pr-metadata.md` → "PR body format"). Why carries the card's Why. Verification: Done when check and result (`CONVENTIONS-verification.md` → "Verification checklist"); scenarios → `### Before` then `### After` under it (`CONVENTIONS-verification.md` → "Before and After"), After `pending: run /cops:pr-wrap-up` each; evidence never holds the PR. Resources names the task source: an issue non-closing, `Relates to #123` or `Relates to owner/repo#123` (`CONVENTIONS-pr-metadata.md` → "Non-closing issue references"); a spec file or chat ask as a line. Write them to `d`, chosen first, per `CONVENTIONS-github.md` → "Passing drafted text to `gh`".

## 7. Wrap up

Report the PR link, commits, Done when result and a raised Size. Show `memory-candidate:` lines, asking whether to save them; only an explicit "remember this" permits `learn-feedback`. Autopilot → before reporting, run autopilot.md's chain, finish and stops (suggest nothing). Otherwise run no other skill; suggest `/cops:pr-wrap-up` when the card lists scenarios, to capture the after, then `/cops:pr-review`, then `/cops:pr-note`, per `CONVENTIONS-orchestration.md` → "Suggesting next steps". End with `CONVENTIONS-orchestration.md` → "Handoffs in the final report", labels `scout-repo + brief-task`, `fix loop` (a second for a sweep follow-up), `sweep-diff` (a second for the follow-up's commit), and `learn-feedback` when run.

## Stop instead of proceeding

- The card isn't confirmed, or the Why has no source and the user hasn't given one.
- On the default branch and the user declines a new branch.
- The sidekick fails after 3 attempts, or `sweep-diff` flags something outside the card's scope.
- The change needs a public API, security, auth, or infrastructure decision the card didn't name.

## Other rules

- **One editing subagent at a time** on the shared checkout.
- **Commits** carry `Skill: cops:pr-start` and `Approved-by: <login>`, since the user confirmed the card (`CONVENTIONS-pr-metadata.md` → "Commit trailers").
