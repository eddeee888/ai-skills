---
name: feature-analyze
description: Size a feature request before committing to build it, or flag when what's described is actually a bug in existing behavior rather than a new capability — this skill only classifies that distinction, it doesn't reproduce or verify a bug itself (that's `issue-verify`'s job). Reads the request, maps what part of the codebase it would actually touch, and — for a genuine feature request — classifies it small (e.g. an additional config option, narrow blast radius), medium (spans multiple packages/files but stays additive), or large (potential breaking changes to one or many packages, big blast radius, needs an RFC and user-facing comms before implementation). Use when asked to "analyze this feature request", "how big is #123", "size this request", "what's the blast radius of this feature", "is this a feature or a bug", or before scoping/estimating any feature request issue. Takes either the URL/number of an issue in the same repo, or a plain-text feature/bug description with no issue filed yet. Read-only by default — it doesn't implement anything or post to GitHub unless the user asks it to share the analysis.
---

# Analyze a feature request

Building a feature before sizing it means the surprise — "this actually breaks three other packages" or "this needed a migration guide" — shows up mid-implementation instead of before anyone commits to it. This skill produces that sizing up front: what's actually being asked, what it touches, and whether it's small enough to just build, big enough to need a design pass, or big enough to need a breaking-change process and user comms before code gets written.

## Step 1: Read the feature request

- **Issue URL or number given** → pull the real content instead of sizing a guess:

  ```bash
  gh issue view <url or number> --json number,title,body,url,labels,state,comments
  ```

- **No URL — just a feature/bug description in the conversation** → there's no issue to fetch; treat the description itself as the request. If it's thin (a one-liner with no use case or shape), ask a clarifying question before sizing rather than inventing the missing detail — same bar as an under-specified issue in Step 2.

Either way, confirm which of the two this actually is. This is a classification call only, not a verification one: spotting the mismatch, not reproducing or confirming anything — that's `issue-verify`'s job, not this skill's.

- **It describes something broken** — existing behavior that doesn't work as documented/intended, only phrased as if something were missing → say so and stop, then hand off based on what you started from:
  - **Started from an existing issue** → it's already filed; point at `issue-verify` to confirm it's real and reproducible.
  - **Started from a plain-text description with no issue** → nothing's filed yet, so there's nothing for `issue-verify` to work from; point at `issue-create` to file it as a bug report first. `issue-verify` can pick it up once that issue exists.
- **It describes a new capability or behavior that doesn't exist today** — including a request that first reads like it could be a fix but, on inspection, is actually asking for smarter/different behavior than what currently exists (e.g. "make X smarter" or "X should also handle Y" rather than "X is broken") → this is a genuine feature request. Proceed to Step 2 — don't stop here. Reconsidering something *toward* "feature" is not itself a reason to stop; the stop condition above only fires when it lands on "bug."

## Step 2: Pin down what's actually being asked

Restate the request in concrete terms: the new behavior, option, or capability wanted, and the use case behind it (why the requester wants it, from the issue body/comments). If the request is vague ("would be nice to have X" with no shape to it), note that ambiguity explicitly rather than quietly picking one implementation shape to size — the classification in Step 4 depends on which shape you're sizing, and a vague request can swing from small to large depending on the shape assumed.

## Step 3: Map the codebase surface it touches

Search the repo for the area(s) involved: the existing API/config surface, the package(s) that own it, and any extension points that already generalize toward what's being asked.

For a monorepo, identify every workspace/package whose public API, exported types, or config schema would need to change — not just the one the issue happened to be filed under.

Look specifically for:

- Existing config/option plumbing the request could hook into without touching call sites (pulls toward "small").
- Shared types/interfaces consumed by more than one package that would need to change (pulls toward "medium" or "large").
- Public API signatures, exported types, CLI flags, or documented behavior that would change incompatibly for existing users (this alone pulls toward "large", regardless of how small the code diff looks).

## Step 4: Classify the size

Escalate only — a request that's mostly small but has one large-sized element (e.g. one breaking type change) is large, full stop, not "small with an asterisk."

**Small** — additive, backward-compatible, confined to one package/file: a new config option with a safe default, a new optional parameter, a new export alongside existing ones. Existing callers are unaffected if they change nothing.

**Medium** — still additive/non-breaking, but the surface spans multiple packages or files: a capability that needs plumbing through a shared type, a new package, or coordinated changes across a monorepo's workspaces. No existing caller breaks, but more than one place needs to know about and adapt to this.

**Large** — any of these apply, in one package or across many:

- A breaking change to an existing public API, config shape, exported type, or documented behavior.
- Blast radius reaching most/all consumers (a default behavior change, a new required step in existing integration code).
- The kind of change that needs an RFC/design doc, a deprecation window, or a migration guide before or alongside implementation.
- Needs proactive communication to users (a blog post, changelog highlight, social post, migration guide) rather than a routine changelog line.

State the classification plus the 1-2 concrete reasons driving it — name the specific breaking surface, the package count, or the comms need. Not "this seems big."

## Step 5: Recommend next steps matching the size

- **Small** → safe to scope directly into an implementation plan; no extra process needed.
- **Medium** → name every package/file that needs touching before implementation starts, and flag whether the cross-package design needs a second pair of eyes before coding begins.
- **Large** → don't recommend jumping to implementation. Call out what breaks and for whom, whether a deprecation path is possible instead of a hard break, and that an RFC/announcement needs drafting and agreement before (or alongside) the code. Name the audience this project actually uses for breaking changes (changelog, blog, Discord/X/wherever) rather than assuming a channel.

## Step 6: Present the analysis

Show the user: what's being asked, the size classification with its reasons, the affected packages/files, and the matching recommendation from Step 5. This skill's job ends here — it doesn't implement the feature, and it doesn't post anything to GitHub unless the user explicitly asks to share the analysis.

- **Sized from an existing issue** → if they ask to share it, draft the comment, show it, and only post after they confirm — the same confirm-before-posting gate the `issue-create` skill uses:

  ```bash
  gh issue comment <number> --body "<confirmed analysis>"
  ```

- **Sized from a plain-text description with no issue** → there's nothing to comment on yet. `issue-create` only drafts bug reports, not feature requests, so it doesn't apply here — if the user wants the analysis filed, draft a title/body from the analysis (matching the repo's own feature-request issue template if it has one) and confirm it with the user before running `gh issue create`, the same confirm-before-posting gate `issue-create` uses for bugs.

## When to stop instead of proceeding

- The request isn't actually a feature request (it describes broken behavior) → say so and stop; hand off to `issue-verify` if it's already filed as an issue, or to `issue-create` to file it as a bug report first if it isn't. (This is the only direction that stops here — landing on "yes, it's a genuine feature," even after reconsidering, means proceed to Step 2, not stop.)
- Not enough detail to know what shape the feature would take, and the shape changes the size call → ask rather than sizing a guessed-at implementation.
- User asks you to implement it, not just size it → out of scope here; this skill sizes the request, it doesn't hand off into an implementation flow.
- User hasn't confirmed a drafted comment → never post to the issue on an unconfirmed draft, even if the analysis looks complete.
