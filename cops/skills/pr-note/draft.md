# pr-note: Steps 3–5

Read by the subagent `SKILL.md` hands these steps to (or the main chat when there's no subagent). The oracle's profile (`scout-repo`) and brief (`brief-task`) come in your prompt — don't call the oracle yourself. Where a step says to ask or tell the user, return it as your question or in your result instead.

`Resuming:` not `no` → it carries your earlier question and the user's answer. Check what's done — whether a review from the user with your notes is already on the PR, or a pending one — and pick up at the step that asked, using the answer. Never post a second review for the same notes.

## Comment kinds

Every comment starts with exactly one of these prefixes, in bold (`**Note:**`, `CONVENTIONS.md` → "Comment labels"), then why (`CONVENTIONS.md` → "Comment body"), with any source linked (`CONVENTIONS.md` → "Citing sources"). No ```suggestion``` blocks — these explain the code as it is. What `cops:pr-address` and `cops:pr-review` do with them is in `CONVENTIONS.md` → "Author notes".

- **`Note:`** — a choice the task didn't specify: one approach over another, where a helper lives, a default picked, an edge case handled a particular way. Give the reason in plain words: `Note: inlined the parser, since this is its only caller`. A choice that follows a remembered preference still gets its reason, not "per my preferences" — never cite memory or the oracle.
- **`Drive-by:`** — a change the task doesn't need: a fix, rename, or cleanup made in passing. Leave the code in and say why it's here: `Drive-by: this guard threw on an empty list, which the new caller hits`. A drive-by with no reason worth stating is one to take out, not explain — don't comment on it; return it under `unexplained drive-bys` instead.

## What gets a comment

- **The task** is your prompt's `Task:` line, else what the linked issue, the PR body, and the commit messages say the PR is for. None of them says → return the question of what the PR is for before drafting; never treat the whole diff as drive-bys.
- **Only what's unexplained.** Skip a choice the PR body, a commit message, or a code comment already explains, and a choice so standard no reviewer would ask.
- **Every drive-by gets one anyway.** A drive-by is easy to miss, and a reviewer may not read the PR body, so a `Drive-by:` goes on its lines even when the body or a commit message already explains it.
- **One comment per decision.** The same choice repeated across the diff gets one comment on its first occurrence saying where else it applies (`same in b.ts and c.ts`).
- Skip lines your prompt's `Already noted:` lists — the user's own notes cover them.
- Generated files, lockfiles, snapshots, and vendored code get no comments.
- About 10 at most. More → rank by what a reviewer is likeliest to ask about, keep the top ones, and return how many you dropped.

## Step 3: Read the change

```bash
gh pr diff <number>
gh pr view <number> --json body,commits,closingIssuesReferences
```

Your prompt says `GitHub: MCP` → use `pull_request_read` method `get_diff`, then methods `get` and `get_commits`. Read the linked issue too (`closingIssuesReferences`, or a reference in the body or commits) with `gh issue view <n>` (MCP: `issue_read` method `get`) — it's the clearest statement of the task.

Read the whole diff, the PR body, the commit messages, and the issue before drafting. Note each candidate line with its path and its line number on the new side of the diff — only lines inside a diff hunk can hold an inline comment — and whether it's a choice inside the task or a change outside it.

Nothing unexplained → return `nothing unexplained` and post nothing.

## Step 4: Draft the notes

The brief in your prompt lists the remembered rules that apply to this change. A changed line that follows one is a candidate `Note:` — the rule tells you the choice was deliberate, and its wording gives you the reason to state, in your own words.

Draft every comment in the "Comment kinds" format: path, line (or start and end line for a range), kind, and body. Leave the review's top-level body empty. Don't return the draft for a go-ahead — post it in Step 5. These explain the user's own choices on the user's own PR, and asking first makes them read like a review rather than the author talking.

## Step 5: Post it as one review

Sign every comment with `cops:pr-note`, without the `Approved: <login>` part — the user didn't see the draft (`CONVENTIONS.md` → "Skill signature"). Post every comment in a single `COMMENT` review on the head commit your prompt names, exactly as `cops:pr-review` Step 6 does (`../pr-review/SKILL.md` from this file): on the `gh` route, the payload goes in `$(git rev-parse --git-dir)/pr-note.json` (`CONVENTIONS.md` → "Passing drafted text to `gh`") and is sent with `gh api repos/<owner>/<repo>/pulls/<number>/reviews --input`, then removed; on the MCP route, a pending review, one `add_comment_to_pending_review` per comment, then `submit_pending` with `event: COMMENT`.

GitHub rejects a comment because its line isn't in the diff → move it to the nearest changed line in the same hunk. No such line → leave it out and return it under `not posted`; never drop it silently. A failure partway through the MCP route leaves a pending review only the user can see → stop and return `pending review left: <what failed>`; never delete it yourself.
