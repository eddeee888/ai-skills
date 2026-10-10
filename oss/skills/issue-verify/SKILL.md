---
name: issue-verify
description: 'Verify that a GitHub issue is reproducible before fixes. Check for a reproduction, ask the reporter if missing, write a test, and push the failing test as a checkpoint commit with the `Skill: oss:issue-verify` trailer. Use for “verify issue #123,” “triage this issue,” “check if this bug is real/reproducible,” or before fixing any reported bug. `issue-fix` builds on the checkpoint.'
---

# Verify a GitHub issue

Turn a reported issue into evidence: a failing test proving the bug exists, or a template-grounded request when reproduction details are insufficient. Never fix the bug here; `issue-fix` builds on the checkpoint. The job ends when the failing test is committed and pushed; its draft PR need not merge or become green.

**This skill never runs `cops:pr-sync` itself.** The checkpoint PR is written from the test it opens with and pushed to only once, so it's always current.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS-github.md` → "GitHub access").

## Step 1: Check for an existing checkpoint, then read the issue

Before discovery, explicitly read `../checkpoint.md`, then follow it for local/remote checks, anchored trailer matching, the exact issue-number guard, and its sentinels.

`CHECKPOINT_FOUND` → stop, name the commit and branch, and point to `issue-fix`. Proceed only when the user explicitly asks to redo a wrong reproduction. `CHECKPOINT_AMBIGUOUS` → ask which issue. `CHECKPOINT_NOT_FOUND` → read the issue:

```bash
gh issue view <number> --json number,title,body,url,labels,state,comments \
  --jq '{number,title,body,url,state,labels:[.labels[].name],total:(.comments|length),comments:(.comments[-10:]|map({author:.author.login,body}))}'
```

If no reproduction appears and `total` shows earlier comments, read those too.

Obtain `scout-repo` from `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor when available (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). It supplies the bug template, package map, test layout, and one-test command. Read only the named bug template. Without it, run `ls .github/ISSUE_TEMPLATE/ 2>/dev/null`, read only the obvious bug template, and ask if ambiguous; otherwise check `.github/ISSUE_TEMPLATE.md`. Record the reproduction field's exact wording.

## Step 2: Decide whether a reproduction already exists

Look through the issue body and comments for one of:

- A link to a live reproduction (CodeSandbox, StackBlitz, a minimal repo, a REPL).
- A self-contained code block that reproduces the bug end-to-end.
- Steps precise enough to reproduce without guessing: exact versions, exact API calls/inputs, expected vs. actual behavior.

“It doesn't work” or intermittent failure without those details is insufficient. This is a hard gate: do not delegate, write, or run any code/test before reproduction sufficiency is established.

## Step 3: No usable repro → draft a request, confirm, then post it

With a template field, name it: *“Could you share a link to a minimal reproduction? This issue template asks for one under '\<field name\>' — a CodeSandbox/StackBlitz link or a small repo works best.”* Without one, request exact package versions, a minimal sample, and expected versus actual behavior.

Keep it short (`CONVENTIONS-posts.md` → "Comment body"). Show the exact draft as one question (`CONVENTIONS-posts.md` → "Approving drafts: one question per item") and wait: “confirmed” means the user approved the wording, not that the reporter replied. Sign it `oss:issue-verify`, `Approved: <login>` (`CONVENTIONS-posts.md` → "Skill signature"), write it to a file, and only after confirmation run (`CONVENTIONS-github.md` → "Passing drafted text to `gh`"):

```bash
gh issue comment <number> --body-file <file>
```

Stop. Do not poll; rerun after a reporter response.

## Step 4: Usable repro → write a failing test

Only now identify the package by matching repro imports/API calls to the owning workspace, not issue labels. Explicitly read `./draft.md`, then delegate at its prescribed timing using its failing-test prompt and mechanics (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent").

If the test does not fail as reported, discard it and return to Step 3 with the finding. Never force an unrelated red test.

## Step 5: Leave it failing, commit it as the checkpoint, open the PR

Follow `./draft.md`: leave the matching test red, create `repro/<issue-number>`, commit with the required anchored trailer, push, and open a draft PR using non-closing issue references and file-backed title/body. Red checks are expected.

## Step 6: Wrap up

Never run or suggest `cops:pr-sync`; the new PR already matches its branch. Report the PR URL and end with handoffs (`CONVENTIONS-orchestration.md` → "Handoffs in the final report"), labels `scout-repo`, `brief-task`, and `test loop`.

## When to stop instead of proceeding

- Existing checkpoint → stop at Step 1 and point to `issue-fix`.
- Ambiguous checkpoint without an issue number → ask; do not choose.
- No usable repro → after approved request posting, stop; never write a speculative test.
- Repro-request draft unconfirmed → do not post.
- The test doesn't fail the way the issue describes → don't commit or push it; go back to the reporter with what you found.
- The test cannot run cleanly after three corrections → stop without commit/push and report why.
- Never skip or mark the test pending to make checks green; leave the matching failure red.
