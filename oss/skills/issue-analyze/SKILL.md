---
name: issue-analyze
description: Size an issue before working on it — a feature request, or a read-only root-cause take on a bug report (no reproducing, tests, or pushes; that's `issue-verify`/`issue-fix`). Maps what the change would touch and classifies it small (one function, or an additive config option), medium (shared logic or several packages, still non-breaking), or large (breaking changes, wide blast radius, needs an RFC and user comms). Takes an issue URL/number or a plain-text description. Use when asked to "analyze/size this issue", "how big is #123", "what's the blast radius", "is this a feature or a bug", or before scoping any issue. Read-only unless asked to share the analysis.
---

# Analyze an issue: a bug report or a feature request

Size an issue before working on it, so a blast radius, root-cause shape, or comms need surfaces up front instead of mid-implementation: what's broken (or being asked for), what it touches, and whether it's small enough to fix/build directly or needs deeper verification, a design pass, or a breaking-change process first.

This skill never reproduces a bug, writes a test, or pushes a commit — it reads code and reasons about it. Confirming a bug is `issue-verify`'s job; picking and implementing a fix is `issue-fix`'s. It can run before either, or alone as a quick gut-check.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Read and classify the issue

- Issue URL or number given → pull the body and last 10 comments: `gh issue view <url or number> --json number,title,body,url,labels,state,comments --jq '{number,title,body,url,state,labels:[.labels[].name],total:(.comments|length),comments:(.comments[-10:]|map({author:.author.login,body}))}'`. Read earlier comments only when what you need isn't there and `total` says there are more.
- Only a description in the conversation → treat it as the issue. Thin (a one-liner with no use case or shape) → ask a clarifying question before sizing rather than inventing detail. Search for a duplicate first (`gh issue list --repo <owner>/<repo> --search "<keywords>" --state all` — closed ones count too). Match → point the user at it instead of continuing.

In a monorepo, get the repo's profile (`scout-repo`) from `cops:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, when available (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"), and pass its package map to Step 3's subagent so the survey doesn't rediscover the workspace layout. Not available → the subagent works it out.

Then classify it and jump to the matching path:

- **Describes something broken** — existing behavior that doesn't work as intended, even if phrased as something missing → bug. Go to "Path A: bug report".
- **Describes a new capability** — including a request that reads like a fix but is really "make X smarter" or "X should also handle Y" rather than "X is broken" → feature request. Go to "Path B: feature request". Reconsidering something *toward* feature is never a reason to stop.

## Path A: bug report

### Step 2: Pin down the bug being reported

Restate observed vs. expected behavior. Expected behavior unclear → say so rather than guessing.

### Step 3: Trace the likely root cause

By reading the code path the reported behavior runs through, not running anything, hypothesize where it goes wrong. Name the suspect function/module/condition, and say plainly when the code doesn't pin it to one spot — a tentative "likely X, possibly Y" beats false certainty. In a monorepo, note every package the root cause implicates.

Hand the reading to an exploring subagent (`CONVENTIONS.md` → "Hand long loops to a subagent") so the files it reads stay out of this chat. Pass observed vs. expected behavior, any entry point the issue names, and the profile's package map if you have one; ask for the suspect function(s)/files, packages involved, and its confidence, in a few lines. Size from its answer — don't re-read what it read.

Signals:

- Isolated bad condition/edge case in one function → pulls toward "small".
- A shared helper, or the bug shows up wherever a shared type/interface is consumed → pulls toward "medium" or "large".
- A correct fix would change documented behavior, a public API's contract, or output other code/users depend on → pulls toward "large" regardless of how small the code change looks.
- Root cause is in a dependency's own code → note which dependency, which version, and the evidence (the function/file in its source, a matching upstream issue/changelog entry). This changes which size rubric applies below.

### Step 4: Classify the fix's size

Escalate only — a mostly-small fix with one large-sized element is large, not "small with an asterisk."

- **Small** — the fix (once verified) would be confined to one function/file, with no change to documented behavior or public contract: a missing null check, an off-by-one, a wrong condition.
- **Medium** — the fix would touch a shared helper, or land in more than one package/file, without changing the documented contract for callers not hitting the bug.
- **Large** — any of: a correct fix would change documented/public behavior other code relies on (the fix is itself a breaking change); the root cause is tangled into a core assumption spanning multiple packages; a real fix needs a design decision before code can be written.
- **Dependency-rooted** (when Step 3 traced the cause to a dependency; sizes differently): fix already released upstream → small (bump the version). No upstream fix, but workable with a local patch/override and a tracked upstream issue → medium. No upstream fix and the bug is load-bearing enough that our own public API needs a workaround → large. This mirrors the options `issue-fix` Step 4 will present once the bug is verified — don't re-litigate them here, just flag the finding.

State the classification plus the 1-2 concrete reasons driving it, tied to Step 3's hypothesis.

### Step 5: Recommend next steps

Whatever the size, say plainly that this skill hasn't confirmed the bug is real, and point at the next step:

- Already filed → point at `issue-verify` to confirm it's real and reproducible before any fix lands; mention the size hypothesis so whoever picks it up isn't starting cold.
- Not filed → point at `issue-create` to file it first (carrying the root-cause hypothesis into the report), then `issue-verify`.
- **Large** → flag the design ambiguity or behavior-contract question up front, since `issue-fix` will hit the same fork once it verifies the bug.

Continue to Step 6.

## Path B: feature request

### Step 2: Pin down the feature being asked

Restate the new behavior/option/capability wanted and its use case. Vague ("would be nice to have X" with no shape) → say so rather than quietly picking one shape to size — Step 4's classification depends on the shape.

### Step 3: Map the codebase surface it touches

Find the area(s) involved: the existing API/config surface, the owning package(s), and any extension points that already generalize toward the request. In a monorepo, list every workspace whose public API, exported types, or config schema would change — not just the one the issue was filed under.

Hand the search to an exploring subagent as in Path A's Step 3: pass the requested capability; ask for the surface it touches, the owning packages, and existing extension points, in a few lines.

Signals:

- Existing config/option plumbing to hook into, no call-site changes → pulls toward "small".
- Shared types/interfaces used by more than one package would change → pulls toward "medium" or "large".
- Public API signatures, exported types, CLI flags, or documented behavior changing incompatibly for existing users → pulls toward "large" regardless of how small the diff looks.

### Step 4: Classify the size

Same escalate-only rule: one large-sized element makes the whole request large.

- **Small** — additive, backward-compatible, confined to one package/file: a new config option with a safe default, a new optional parameter, a new export alongside existing ones. Existing callers who change nothing are unaffected.
- **Medium** — still additive/non-breaking, but spans multiple packages or files: plumbing through a shared type, a new package, or coordinated changes across a monorepo's workspaces.
- **Large** — any of: a breaking change to an existing public API, config shape, exported type, or documented behavior; blast radius reaching most/all consumers; needs an RFC/design doc, a deprecation window, or a migration guide; needs proactive user comms (blog post, changelog highlight, social post) rather than a routine changelog line.

State the classification plus the 1-2 concrete reasons driving it — not "this seems big."

### Step 5: Recommend next steps

- **Small** → safe to scope directly into an implementation plan.
- **Medium** → name every package/file to touch before implementation starts, and flag whether the cross-package design needs a second pair of eyes.
- **Large** → don't recommend jumping to implementation. Call out what breaks and for whom, whether a deprecation path could replace a hard break, and that an RFC/announcement needs drafting and agreement before (or alongside) the code. Name the audience this project uses for breaking changes rather than assuming a channel.

Continue to Step 6.

## Step 6: Present the analysis

Show the user: what's reported or asked, the size classification with its reasons, the root-cause hypothesis (or affected packages/files, for a feature), and Step 5's recommendation. This skill ends here — no implementation, reproduction, or test, and nothing posted to GitHub unless the user asks to share it. End with the handoffs list (`CONVENTIONS.md` → "Handoffs in the final report"), with labels `scout-repo` and `code survey`.

- Sized from an existing issue, asked to share → draft the comment (`CONVENTIONS.md` → "Comment body", `CONVENTIONS.md` → "Citing sources"), show it, and post only after confirmation, signed (`oss:issue-analyze`, `Approved: <login>` — `CONVENTIONS.md` → "Skill signature"), from a file (`CONVENTIONS.md` → "Passing drafted text to `gh`"): `gh issue comment <number> --body-file <file>`
- Plain-text bug description, nothing filed, user wants it filed → hand off to `issue-create` with the root-cause hypothesis as context rather than drafting here.
- Plain-text feature description, nothing filed, user wants it filed → `issue-create` only drafts bug reports, so draft a title/body from the analysis here (matching the repo's feature-request template if it has one; sources per `CONVENTIONS.md` → "Citing sources"), confirm with the user, sign the body as above, then `gh issue create --repo <owner>/<repo> --title "$(cat <title-file>)" --body-file <body-file>` (`CONVENTIONS.md` → "Passing drafted text to `gh`").

## Also stop instead of proceeding

- User asks you to implement or fix it → out of scope; this skill sizes the issue and doesn't hand off into an implementation flow.
- User asks you to confirm/reproduce a bug or write a failing test → that's `issue-verify`; stay read-only.
- A drafted comment or issue hasn't been confirmed → never post it, even if the analysis looks complete.
