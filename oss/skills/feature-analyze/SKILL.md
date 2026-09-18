---
name: feature-analyze
description: Size a feature request before committing to build it, or give a high-level, read-only root-cause take on a bug report — without reproducing it, writing a test, or pushing anything (that's `issue-verify`/`issue-fix`'s job). Reads the request, maps what part of the codebase it would actually touch, and classifies it small (e.g. an additional config option, or a fix confined to one function, narrow blast radius), medium (spans multiple packages/files but stays additive, or a fix that touches shared logic/several call sites), or large (potential breaking changes to one or many packages, big blast radius, needs an RFC and user-facing comms before implementation — or, for a bug, a root cause tangled in a core assumption where even a correct fix changes documented behavior). Use when asked to "analyze this feature request", "how big is #123", "size this request", "what's the blast radius of this feature", "is this a feature or a bug", "roughly what's causing this bug and how big is the fix", or before scoping/estimating any feature or bug issue. Takes either the URL/number of an issue in the same repo, or a plain-text feature/bug description with no issue filed yet. Read-only by default — it doesn't implement, reproduce, write tests, or post to GitHub unless the user asks it to share the analysis.
---

# Analyze a feature request or bug

Size a request before building it, so a blast radius, root-cause shape, or comms need surfaces up front instead of mid-implementation: what's actually being asked (or actually broken), what it touches, and whether it's small enough to just build/fix, or big enough to need a design pass, deeper verification, or a breaking-change process first.

This skill never reproduces a bug, writes a test, or pushes a commit — it reads code and reasons about it. Confirming a bug is real and reproducible is `issue-verify`'s job; picking and implementing a fix is `issue-fix`'s. This skill's bug path is a fast, read-only triage step that can run before either of those, or on its own for a quick gut-check.

## Step 1: Read and classify the request

- Issue URL or number given → pull the real content: `gh issue view <url or number> --json number,title,body,url,labels,state,comments`
- No issue — just a description in the conversation → treat the description itself as the request. Thin (a one-liner with no use case or shape) → ask a clarifying question before sizing rather than inventing the missing detail. Before going further, search existing issues for a duplicate or closely related one (`gh issue list --search "<keywords>"`) — regardless of which way this turns out to classify, analyzing (or filing) a duplicate wastes the same effort either direction. Found a match → point the user at it instead of continuing.

Then classify which of the two this actually is, and jump to the matching path below:

- **Describes something broken** — existing behavior that doesn't work as intended, just phrased as if something were missing → this is a bug. Go to "Path B: bug report".
- **Describes a new capability that doesn't exist today** — including a request that first reads like a fix but, on inspection, is really "make X smarter" or "X should also handle Y" rather than "X is broken" → it's a genuine feature request. Go to "Path A: feature request". Reconsidering something *toward* feature is never a reason to stop.

## Path A: feature request

### Step 2: Pin down the feature being asked

Restate the new behavior/option/capability wanted and the use case behind it (from the issue body/comments). If the request is genuinely vague ("would be nice to have X" with no shape), say so explicitly rather than quietly picking one shape to size — Step 4's classification depends on which shape you size, and a vague request can swing from small to large depending on the shape assumed.

### Step 3: Map the codebase surface it touches

Search the repo for the area(s) involved: the existing API/config surface, the package(s) that own it, and any extension points that already generalize toward what's being asked. For a monorepo, list every workspace whose public API, exported types, or config schema would need to change — not just the one the issue happened to be filed under.

Signals:

- Existing config/option plumbing it could hook into, no call-site changes → pulls toward "small".
- Shared types/interfaces used by more than one package that would need to change → pulls toward "medium" or "large".
- Public API signatures, exported types, CLI flags, or documented behavior changing incompatibly for existing users → pulls toward "large" regardless of how small the diff looks.

### Step 4: Classify the size

Escalate only — a request that's mostly small but has one large-sized element (e.g. one breaking type change) is large, full stop, not "small with an asterisk."

- **Small** — additive, backward-compatible, confined to one package/file: a new config option with a safe default, a new optional parameter, a new export alongside existing ones. Existing callers are unaffected if they change nothing.
- **Medium** — still additive/non-breaking, but the surface spans multiple packages or files: plumbing through a shared type, a new package, or coordinated changes across a monorepo's workspaces. No caller breaks, but more than one place needs to adapt.
- **Large** — any of: a breaking change to an existing public API, config shape, exported type, or documented behavior; blast radius reaching most/all consumers (a default behavior change, a new required integration step); needs an RFC/design doc, a deprecation window, or a migration guide before or alongside implementation; needs proactive user comms (blog post, changelog highlight, social post) rather than a routine changelog line.

State the classification plus the 1-2 concrete reasons driving it — the specific breaking surface, package count, or comms need. Not "this seems big."

### Step 5: Recommend next steps

- **Small** → safe to scope directly into an implementation plan; no extra process needed.
- **Medium** → name every package/file that needs touching before implementation starts, and flag whether the cross-package design needs a second pair of eyes first.
- **Large** → don't recommend jumping to implementation. Call out what breaks and for whom, whether a deprecation path is possible instead of a hard break, and that an RFC/announcement needs drafting and agreement before (or alongside) the code. Name the audience this project actually uses for breaking changes rather than assuming a channel.

Continue to Step 6.

## Path B: bug report

### Step 2: Pin down the bug being reported

Restate the observed behavior vs. the expected behavior (from the issue body/comments, or the plain-text description). If it's unclear what's actually expected to happen instead, say so rather than guessing — a bug analysis needs both sides of the mismatch.

### Step 3: Trace the likely root cause

Read the code path the reported behavior would run through and form a hypothesis for where it goes wrong — by reading, not by running anything. Name the specific function/module/condition you suspect, and say plainly when the code alone doesn't pin it down to one spot (e.g. two plausible causes, or a dependency's behavior in the mix) — a tentative "likely X, possibly Y" beats a confident guess dressed as certainty. For a monorepo, note every package whose behavior the root cause implicates, not just the one the issue was filed under.

Signals:

- Root cause is an isolated bad condition/edge case in one function → pulls toward "small".
- Root cause is a shared helper, or the bug shows up wherever a shared type/interface is consumed → pulls toward "medium" or "large".
- A correct fix would change documented behavior, an existing public API's contract, or output that other code/users already depend on → pulls toward "large" regardless of how small the code change looks.

### Step 4: Classify the fix's size

Same escalate-only rule: one large-sized element makes the whole fix large, even if the rest is trivial.

- **Small** — the fix (once verified) would be confined to one function/file, with no change to any documented behavior or public contract for other inputs: a missing null check, an off-by-one, a wrong condition.
- **Medium** — the fix would need to touch a shared helper, or land in more than one package/file, but still without changing the documented contract for callers who aren't hitting the bug.
- **Large** — any of: a correct fix would change documented/public behavior that other code relies on (so the "fix" is itself a breaking change); the root cause is tangled into a core assumption spanning multiple packages; a real fix needs a design decision (e.g. which of two conflicting documented behaviors is "correct") before code can be written.

State the classification plus the 1-2 concrete reasons driving it, tied to the root-cause hypothesis from Step 3 — not "this looks like a big fix."

### Step 5: Recommend next steps

Whatever the size, this skill hasn't confirmed the bug is real — say that plainly, and point at the actual next step rather than implying the analysis alone is enough to act on:

- Already filed as an issue → point at `issue-verify` to confirm it's real and reproducible before any fix lands; mention the size hypothesis so whoever picks it up isn't starting cold.
- Not filed yet → point at `issue-create` to file it as a bug report first (carrying the root-cause hypothesis into the report), then `issue-verify` to confirm it.
- **Large** specifically → flag the design ambiguity or behavior-contract question up front, since `issue-fix` will hit the same fork once it verifies the bug.

Continue to Step 6.

## Step 6: Present the analysis

Show the user: what's being asked or reported, the size classification with its reasons, the affected packages/files (or the root-cause hypothesis, for a bug), and the matching recommendation from Step 5 of whichever path ran. This skill's job ends here — no implementation, no reproduction, no test, and nothing posted to GitHub unless the user asks to share it.

- Sized from an existing issue → if asked to share it, draft the comment, show it, and only post after confirmation: `gh issue comment <number> --body "<confirmed analysis>"`
- Sized from a plain-text feature description with nothing filed → `issue-create` only drafts bug reports, not feature requests. If the user wants it filed, draft a title/body from the analysis (matching the repo's feature-request template if it has one), confirm with the user, then `gh issue create`.
- Sized from a plain-text bug description with nothing filed → if the user wants it filed, hand off to `issue-create` with the root-cause hypothesis as context rather than drafting the issue here.

## Also stop instead of proceeding

- User asks you to implement or fix it, not just size/analyze it → out of scope here; this skill sizes the request, it doesn't hand off into an implementation flow.
- User asks you to confirm/reproduce a bug or write a failing test → that's `issue-verify`, not this skill; stay read-only.
- A drafted comment or issue hasn't been confirmed → never post it, even if the analysis looks complete.
