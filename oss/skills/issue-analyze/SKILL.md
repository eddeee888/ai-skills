---
name: issue-analyze
description: 'Analyze and size an issue before work: read-only root-cause reasoning for bugs, never reproduction, tests, or pushes (`issue-verify`/`issue-fix` handle those). Classifies size and blast radius and takes an issue URL, number, or description. Use for “analyze/size this issue,” “how big is #123,” “what’s the blast radius,” “is this a feature or bug,” or issue scoping.'
---

# Analyze an issue: a bug report or a feature request

Size an issue before work starts: identify what is broken or requested, what it touches, and whether it needs verification, design, or a breaking-change process.

This skill is read-only. Never reproduce a bug, run or write tests, edit code, commit, or push. `issue-verify` confirms bugs; `issue-fix` chooses and implements fixes.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS-github.md` → "GitHub access").

## Step 1: Read and classify the issue

- URL or number → fetch the body and last 10 comments: `gh issue view <url or number> --json number,title,body,url,labels,state,comments --jq '{number,title,body,url,state,labels:[.labels[].name],total:(.comments|length),comments:(.comments[-10:]|map({author:.author.login,body}))}'`. Read earlier comments only when needed and `total` shows more.
- Conversation description → treat it as the issue. If it is a one-liner without a use case or shape, ask a clarifying question before sizing. First search all states for duplicates: `gh issue list --repo <owner>/<repo> --search "<keywords>" --state all`. A match, including a closed one, means point the user to it and stop instead of duplicating the analysis.

In a monorepo, obtain the `scout-repo` profile from `cops:pr-oracle` on Claude Code or the `pr-oracle` subagent on Cursor when available (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). Pass its package map to the survey. If unavailable, let the survey discover the layout.

Classify before surveying:

- Existing behavior does not work as intended, even if phrased as missing → **bug**.
- A new capability, including “make X smarter” or “X should also handle Y” → **feature**. Reclassification toward feature never requires stopping.

## Step 2: Load exactly one path

After classification, explicitly read exactly one file:

- Bug → read `./size-bug.md`.
- Feature → read `./size-feature.md`.

Do not read the unselected path file. Follow the selected file's survey prompt, evidence rubric, escalate-only sizing rules, dependency handling, and recommendation logic. It returns the path-specific analysis needed below. The survey is delegated per `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"; size from its concise answer and do not re-read the files it read.

## Step 3: Present the analysis

Show:

- what is reported or requested;
- the size classification and 1–2 evidence-backed reasons;
- for a bug, observed versus expected behavior and the root-cause hypothesis, named suspect functions/files, implicated packages, confidence, and any dependency evidence;
- for a feature, requested behavior and use case, affected APIs/config/extensions, packages/files, and compatibility impact;
- the selected path's recommendation.

Say plainly that a bug analysis has not confirmed the bug is real. This skill ends here: no implementation, reproduction, test, or GitHub write unless the user asks to share. End with the handoffs list (`CONVENTIONS-orchestration.md` → "Handoffs in the final report"), labels `scout-repo` and `code survey`.

## Step 4: Sharing and filing gates

- Existing issue and user asks to share → draft a comment (`CONVENTIONS-posts.md` → "Comment body" and "Citing sources"), show it verbatim, and post only after confirmation. Sign it `oss:issue-analyze`, `Approved: <login>` (`CONVENTIONS-posts.md` → "Skill signature"), write it to a file, then run `gh issue comment <number> --body-file <file>` (`CONVENTIONS-github.md` → "Passing drafted text to `gh`").
- Unfiled plain-text bug and user wants it filed → hand off to `issue-create`, carrying the root-cause hypothesis. Do not draft it here.
- Unfiled plain-text feature and user wants it filed → because `issue-create` drafts only bug reports, draft the title/body here using the repository's feature-request template when present and link sources (`CONVENTIONS-posts.md` → "Citing sources"). Show it and wait for confirmation. Then sign the body as above, write title/body files, and run `gh issue create --repo <owner>/<repo> --title "$(cat <title-file>)" --body-file <body-file>` (`CONVENTIONS-github.md` → "Passing drafted text to `gh`").

Never post a draft before confirmation.

## Handoffs

- Filed bug → `issue-verify`, carrying the size and root-cause hypothesis.
- Unfiled bug → `issue-create`, then `issue-verify`.
- Small feature → implementation planning.
- Medium feature → name all packages/files and whether cross-package design needs review.
- Large feature or bug → surface the design ambiguity, affected audience, contract break, deprecation alternative, and required RFC/announcement before implementation.

## Stop conditions

- User asks you to implement or fix it → out of scope; this skill sizes the issue and doesn't hand off into an implementation flow.
- User asks you to confirm/reproduce a bug or write a failing test → that's `issue-verify`; stay read-only.
- The issue is too thin to size → ask for its missing use case or shape; do not invent one.
- A duplicate is found → point to it rather than continuing.
- A drafted comment or issue hasn't been confirmed → never post it, even if the analysis looks complete.
