---
name: issue-analyze
description: Size an issue before working on it — a feature request, or a read-only root-cause take on a bug report (no reproducing, tests, or pushes; that's `issue-verify`/`issue-fix`). Maps what the change would touch and classifies it small (one function, or an additive config option), medium (shared logic or several packages, still non-breaking), or large (breaking changes, wide blast radius, needs an RFC and user comms). Takes an issue URL/number or a plain-text description. Use when asked to "analyze/size this issue", "how big is #123", "what's the blast radius", "is this a feature or a bug", or before scoping any issue. Read-only unless asked to share the analysis.
---

# Analyze an issue: a bug report or a feature request

Size an issue before working on it, so a blast radius, root-cause shape, or comms need surfaces up front instead of mid-implementation: what's actually broken (or actually being asked for), what it touches, and whether it's small enough to just fix/build, or big enough to need deeper verification, a design pass, or a breaking-change process first.

This skill never reproduces a bug, writes a test, or pushes a commit — it reads code and reasons about it. Confirming a bug is real and reproducible is `issue-verify`'s job; picking and implementing a fix is `issue-fix`'s. This skill is a fast, read-only triage step that can run before either of those, or on its own for a quick gut-check.

GitHub steps below are `gh` commands. Without `gh` (e.g. Claude Code on the web), use the GitHub MCP tool for each (`CONVENTIONS.md` → "GitHub access").

## Step 1: Read and classify the issue

- Issue URL or number given → pull the real content: `gh issue view <url or number> --json number,title,body,url,labels,state,comments --jq '{number,title,body,url,state,labels:[.labels[].name],total:(.comments|length),comments:(.comments[-10:]|map({author:.author.login,body}))}'` — the body and the last 10 comments. Read earlier comments only when what you need isn't there and `total` says there are more.
- No issue — just a description in the conversation → treat the description itself as the issue. Thin (a one-liner with no use case or shape) → ask a clarifying question before sizing rather than inventing the missing detail. Search existing issues for a duplicate first (`gh issue list --repo <owner>/<repo> --search "<keywords>" --state all` — closed ones count too). Found a match → point the user at it instead of continuing.

In a monorepo, get the repo's profile (`scout-repo`) from `pr:pr-oracle` on Claude Code, or the `pr-oracle` subagent on Cursor, when it's available (`CONVENTIONS.md` → "Consulting the `pr-oracle` agent"), and pass its package map to Step 3's subagent, so the survey doesn't rediscover the workspace layout. Not available → the subagent works it out.

Then classify which of the two this actually is, and jump to the matching path below:

- **Describes something broken** — existing behavior that doesn't work as intended, just phrased as if something were missing → this is a bug. Go to "Path A: bug report".
- **Describes a new capability that doesn't exist today** — including a request that first reads like a fix but, on inspection, is really "make X smarter" or "X should also handle Y" rather than "X is broken" → it's a genuine feature request. Go to "Path B: feature request". Reconsidering something *toward* feature is never a reason to stop.

## Path A: bug report

### Step 2: Pin down the bug being reported

Restate the observed behavior vs. the expected behavior. Unclear what's actually expected instead → say so rather than guessing.

### Step 3: Trace the likely root cause

Read the code path the reported behavior would run through and form a hypothesis for where it goes wrong — by reading, not by running anything. Name the specific function/module/condition you suspect, and say plainly when the code alone doesn't pin it down to one spot — a tentative "likely X, possibly Y" beats a confident guess dressed as certainty. For a monorepo, note every package whose behavior the root cause implicates.

Hand the reading to an exploring subagent (`CONVENTIONS.md` → "Hand long loops to a subagent"), so the files it reads stay out of this chat. Pass the observed vs. expected behavior, any entry point the issue names, and the profile's package map if you have one; ask for the suspect function(s)/files, the packages involved, and how sure it is, in a few lines. Size from its answer — don't re-read what it read.

Signals:

- Root cause is an isolated bad condition/edge case in one function → pulls toward "small".
- Root cause is a shared helper, or the bug shows up wherever a shared type/interface is consumed → pulls toward "medium" or "large".
- A correct fix would change documented behavior, an existing public API's contract, or output that other code/users already depend on → pulls toward "large" regardless of how small the code change looks.
- Root cause traces outside this repo entirely, into a dependency's own code → note which dependency, which version, and the evidence (the function/file in its source, a matching upstream issue/changelog entry). This changes which size rubric applies below.

### Step 4: Classify the fix's size

Escalate only — a fix that's mostly small but has one large-sized element is large, full stop, not "small with an asterisk."

- **Small** — the fix (once verified) would be confined to one function/file, with no change to any documented behavior or public contract: a missing null check, an off-by-one, a wrong condition.
- **Medium** — the fix would need to touch a shared helper, or land in more than one package/file, but still without changing the documented contract for callers who aren't hitting the bug.
- **Large** — any of: a correct fix would change documented/public behavior that other code relies on (so the "fix" is itself a breaking change); the root cause is tangled into a core assumption spanning multiple packages; a real fix needs a design decision before code can be written.
- **Dependency-rooted** (sizes differently from the above, when Step 3 traced the cause to a dependency): a fix already released upstream → small (bump the version). No upstream fix yet, but workable with a local patch/override and a tracked upstream issue → medium. No upstream fix and the bug is load-bearing enough that our own public API needs a workaround → large. This mirrors the options `issue-fix` Step 4 will present once the bug is verified — don't re-litigate them here, just flag the finding.

State the classification plus the 1-2 concrete reasons driving it, tied to the root-cause hypothesis from Step 3.

### Step 5: Recommend next steps

Whatever the size, this skill hasn't confirmed the bug is real — say that plainly, and point at the actual next step:

- Already filed as an issue → point at `issue-verify` to confirm it's real and reproducible before any fix lands; mention the size hypothesis so whoever picks it up isn't starting cold.
- Not filed yet → point at `issue-create` to file it as a bug report first (carrying the root-cause hypothesis into the report), then `issue-verify` to confirm it.
- **Large** specifically → flag the design ambiguity or behavior-contract question up front, since `issue-fix` will hit the same fork once it verifies the bug.

Continue to Step 6.

## Path B: feature request

### Step 2: Pin down the feature being asked

Restate the new behavior/option/capability wanted and the use case behind it. Genuinely vague ("would be nice to have X" with no shape) → say so explicitly rather than quietly picking one shape to size — Step 4's classification depends on which shape you size.

### Step 3: Map the codebase surface it touches

Search the repo for the area(s) involved: the existing API/config surface, the package(s) that own it, and any extension points that already generalize toward what's being asked. For a monorepo, list every workspace whose public API, exported types, or config schema would need to change — not just the one the issue happened to be filed under.

Hand the search to an exploring subagent the same way as Path A's Step 3: pass the requested capability, and ask for the surface it touches, the owning packages, and any existing extension points, in a few lines.

Signals:

- Existing config/option plumbing it could hook into, no call-site changes → pulls toward "small".
- Shared types/interfaces used by more than one package that would need to change → pulls toward "medium" or "large".
- Public API signatures, exported types, CLI flags, or documented behavior changing incompatibly for existing users → pulls toward "large" regardless of how small the diff looks.

### Step 4: Classify the size

Same escalate-only rule: one large-sized element makes the whole request large, even if the rest is trivial.

- **Small** — additive, backward-compatible, confined to one package/file: a new config option with a safe default, a new optional parameter, a new export alongside existing ones. Existing callers are unaffected if they change nothing.
- **Medium** — still additive/non-breaking, but the surface spans multiple packages or files: plumbing through a shared type, a new package, or coordinated changes across a monorepo's workspaces.
- **Large** — any of: a breaking change to an existing public API, config shape, exported type, or documented behavior; blast radius reaching most/all consumers; needs an RFC/design doc, a deprecation window, or a migration guide; needs proactive user comms (blog post, changelog highlight, social post) rather than a routine changelog line.

State the classification plus the 1-2 concrete reasons driving it — not "this seems big."

### Step 5: Recommend next steps

- **Small** → safe to scope directly into an implementation plan.
- **Medium** → name every package/file that needs touching before implementation starts, and flag whether the cross-package design needs a second pair of eyes.
- **Large** → don't recommend jumping to implementation. Call out what breaks and for whom, whether a deprecation path is possible instead of a hard break, and that an RFC/announcement needs drafting and agreement before (or alongside) the code. Name the audience this project actually uses for breaking changes rather than assuming a channel.

Continue to Step 6.

## Step 6: Present the analysis

Show the user: what's being reported or asked, the size classification with its reasons, the root-cause hypothesis (or the affected packages/files, for a feature), and the matching recommendation from Step 5. This skill's job ends here — no implementation, no reproduction, no test, and nothing posted to GitHub unless the user asks to share it. End with the handoff line (`CONVENTIONS.md` → "Handoff line in the final report"), with labels `scout-repo` and `code survey`.

- Sized from an existing issue → if asked to share it, draft the comment, show it, and only post after confirmation, from a file (`CONVENTIONS.md` → "Passing drafted text to `gh`"): `gh issue comment <number> --body-file <file>`
- Sized from a plain-text bug description with nothing filed → if the user wants it filed, hand off to `issue-create` with the root-cause hypothesis as context rather than drafting the issue here.
- Sized from a plain-text feature description with nothing filed → `issue-create` only drafts bug reports, not feature requests. If the user wants it filed, draft a title/body from the analysis (matching the repo's feature-request template if it has one), confirm with the user, then `gh issue create --repo <owner>/<repo> --title "$(cat <title-file>)" --body-file <body-file>` (`CONVENTIONS.md` → "Passing drafted text to `gh`").

## Also stop instead of proceeding

- User asks you to implement or fix it, not just size/analyze it → out of scope here; this skill sizes the issue, it doesn't hand off into an implementation flow.
- User asks you to confirm/reproduce a bug or write a failing test → that's `issue-verify`, not this skill; stay read-only.
- A drafted comment or issue hasn't been confirmed → never post it, even if the analysis looks complete.
