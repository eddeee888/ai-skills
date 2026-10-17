# pr-start: autopilot

Read this at Step 1 when `--autopilot` was passed; otherwise at Step 3, before showing a card whose Size is Small or Medium. Autopilot carries one confirmed card to a finished draft PR without another prompt (`CONVENTIONS-orchestration.md` → "Autopilot runs"). Everything SKILL.md says still holds unless this file names the difference.

## Flag and login

`--autopilot [<login>]` leads the command argument and is not part of the task. Passing it skips the offer and runs autopilot unless a gate check or the card refuses.

The run acts for one human, who is assigned the PR and named in `Approved-by:`:

- `gh api user --jq '.login + " " + .type'` returns a `User` → that login. A local run needs no argument.
- It fails, or returns a `Bot` → a bot token. The human login is the flag's argument. No argument → the card asks for the login, and nothing is implemented until the user gives one.

Stage checks that compare the PR author with the authenticated login keep using the authenticated login.

## Gate checks

Run these before the card; they only read. SKILL.md Step 1's own checks come first and stop the run as they always do.

```bash
gh repo view --json viewerPermission --jq .viewerPermission
gh label list --search autopilot --json name --jq '.[].name'
```

- **Write access:** the permission is `WRITE`, `MAINTAIN` or `ADMIN`.
- **Label:** the `autopilot` label exists in the repo (MCP: `get_label`). Never create it.

A failed check refuses autopilot: with the flag, say which check failed and offer the normal run; without the flag, make no offer. The normal run then goes on from Step 2 as SKILL.md says.

## At the card

Refuse autopilot, with or without the flag, when:

- the Size is Large;
- the scope is high risk: security or auth, data loss, infrastructure, or a public API. This holds even when the Size is Small; or
- Done when is an observable behavior. Autopilot needs one that is a test or a command, not an observable behavior.

Say why and show the normal card.

Otherwise:

- **With the flag**, the card gains this line above `Confirm, or edit any line.`:

  ```text
  Autopilot authorises: push, open PR, post review, push fixes, edit title and body, post notes, assign <login>
  ```

- **Without the flag**, the confirm screen offers two choices, `Confirm` and `Confirm on autopilot`; the second one's description is that same line. Without a question tool, print the line under the card as the offer.

The card is the only prompt. An edit that makes the card Large or high risk, or changes Done when to an observable behavior, drops autopilot; show the card again without it.

## Fix loop and sweep

Steps 4 and 5 run as SKILL.md and fix-loop.md say: at most 3 attempts, then stop with the work uncommitted. Three differences:

- A sidekick question stops the run. Nothing is asked mid-run; report the question.
- A size raised to Large after the loop stops the run before Step 5.
- A bug reply that says Done when holds without a failing-before result stops the run.

A sweep flag that SKILL.md would bring to the user stops the run too.

## Open the PR

Step 6, with two additions:

- `gh pr create --draft --label autopilot ...` (MCP: add the label after `create_pull_request`, with `issue_write` `update` and `labels`).
- The body file opens, above the template or `## Why`, with the banner:

  ```markdown
  > [!NOTE]
  > Opened on autopilot by [Code Ops](https://github.com/eddeee888/ai-skills/tree/main/cops) plugin;
  > - [ ] Approved by [<login>](https://github.com/<login>)
  ```

  A profile link, never an `@` mention.

## The chain

Run four stages on the new PR, in this fixed order, never in parallel, and never skipping one except `cops:pr-address` as below:

1. `cops:pr-review` — self-review, posted without confirmation as one `COMMENT` review. It is the run's audit trail.
2. `cops:pr-address` — handles the self-review threads by "Address rules" below.
3. `cops:pr-wrap-up` — rebase, then refresh the title, description and changeset.
4. `cops:pr-note` — posts `Note:` and `Drive-by:` comments on the final diff without confirmation.

Each stage is its own skill run. On Claude Code, call the Skill tool with the stage's name and `<PR URL> — autopilot stage of this pr-start run`. On Cursor, read the stage's SKILL.md ([pr-review](../pr-review/SKILL.md), [pr-address](../pr-address/SKILL.md), [pr-wrap-up](../pr-wrap-up/SKILL.md), [pr-note](../pr-note/SKILL.md)) and follow it.

A stage follows its own SKILL.md, including its `Handoffs:` list, with the autopilot difference each file names:

- It asks nothing. A point where it would ask or wait for the user is a stop, except the confirmations autopilot replaces: the review, the notes, and the address rules.
- Its posts carry the skill signature without `Approved:`, since the user has not seen the text (`CONVENTIONS-posts.md` → "Skill signature").
- A `memory-candidate:` line is not a stop: hold it, save nothing, and show it in the final report.
- It suggests no next step.
- A stage with nothing to do (no findings, no threads, already current, nothing unexplained) has finished.
- `cops:pr-wrap-up` and `cops:pr-note` get the card's Goal and Why as motivation and task source; `cops:pr-wrap-up` keeps the banner verbatim, ticked box included.
- `cops:pr-address` and `cops:pr-wrap-up` get `autopilot profile: <Step 2's profile, minus caller only: lines>` after the PR URL. Each uses it instead of `scout-repo` and calls its other mode alone.
- `cops:pr-address` is skipped when `cops:pr-review` reports no findings; other people's threads don't count. Report it.

## Address rules

Only the threads this run's self-review opened are in play; any other thread stays open. The label on each decides:

- `Question:` → left open for the user. The agent never answers its own question.
- `Suggestion:` → applied if low risk.
- `Test:` → applied: the named missing case is added.
- `Issue:` → applied if low risk, test first: write the failing case, confirm it fails for that reason, then fix. Left open if critical (`CONVENTIONS-posts.md` → "Critical changes").

The risk gate in `../pr-address/classify.md` beats the label: high-risk work is never automatic and stays open. A skipped thread gets no reply and stays open. A fixed thread gets one reply naming the fixing commit. Threads are never resolved.

## Finish

Only when all four stages finished, assign the user; they mark the draft ready:

```bash
gh pr edit <number> --add-assignee <login>
```

MCP: `issue_write` `update` with `assignees` (`CONVENTIONS-github.md` → "GitHub access").

Report as Step 7 says, adding each stage's result in one line, the open threads (label, `path:line`), held `memory-candidate:` lines, and each `pending: drop`, `stale`, `manual` and `not-captured` scenario; evidence never holds the finish step. End with `gh pr ready <number>`.

## Stops

Any failure or question ends the run:

- Leave the PR a draft if one exists, and assign the user as "Finish" does. A stop before the PR exists has nothing to assign.
- Don't retry the stage, start a later one, or undo what was already pushed or posted.
- Report the stage reached, what stopped it, what was pushed and posted so far, the held `memory-candidate:` lines, and the command that picks up from there (`/cops:pr-address`, `/cops:pr-wrap-up`, …).

## Handoffs

pr-start's `Handoffs:` list keeps SKILL.md Step 7's labels; each stage reports its own.
