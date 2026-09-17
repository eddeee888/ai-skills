---
name: feature-analyze
description: Size a feature request before committing to build it, or flag when what's described is actually a bug in existing behavior rather than a new capability — this skill only classifies that distinction, it doesn't reproduce or verify a bug itself (that's `issue-verify`'s job). Reads the request, maps what part of the codebase it would actually touch, and — for a genuine feature request — classifies it small (e.g. an additional config option, narrow blast radius), medium (spans multiple packages/files but stays additive), or large (potential breaking changes to one or many packages, big blast radius, needs an RFC and user-facing comms before implementation). Use when asked to "analyze this feature request", "how big is #123", "size this request", "what's the blast radius of this feature", "is this a feature or a bug", or before scoping/estimating any feature request issue. Takes either the URL/number of an issue in the same repo, or a plain-text feature/bug description with no issue filed yet. Read-only by default — it doesn't implement anything or post to GitHub unless the user asks it to share the analysis.
---

# Analyze a feature request

Size a request before building it, so a blast radius or comms need surfaces up front instead of mid-implementation: what's actually being asked, what it touches, and whether it's small enough to just build, or big enough to need a design pass or a breaking-change process first.

## Step 1: Read and classify the request

- Issue URL or number given → pull the real content: `gh issue view <url or number> --json number,title,body,url,labels,state,comments`
- No issue — just a description in the conversation → treat the description itself as the request. Thin (a one-liner with no use case or shape) → ask a clarifying question before sizing rather than inventing the missing detail. Before going further, search existing issues for a duplicate or closely related one (`gh issue list --search "<keywords>"`) — regardless of which way this turns out to classify, sizing (or filing) a duplicate wastes the same effort either direction. Found a match → point the user at it instead of continuing.

Then confirm which of the two this actually is. This is a classification call only, not a verification one — spotting the mismatch, not reproducing or confirming anything (that's `issue-verify`'s job):

- **Describes something broken** — existing behavior that doesn't work as intended, just phrased as if something were missing → say so and stop. Already filed → point at `issue-verify` to confirm it's real and reproducible. Not filed → point at `issue-create` to file it as a bug report first; `issue-verify` can pick it up once that issue exists.
- **Describes a new capability that doesn't exist today** — including a request that first reads like a fix but, on inspection, is really "make X smarter" or "X should also handle Y" rather than "X is broken" → it's a genuine feature request. Proceed to Step 2. Reconsidering something *toward* feature is never itself a reason to stop — only landing on "bug" stops here.

## Step 2: Pin down what's actually being asked

Restate the new behavior/option/capability wanted and the use case behind it (from the issue body/comments). If the request is genuinely vague ("would be nice to have X" with no shape), say so explicitly rather than quietly picking one shape to size — Step 4's classification depends on which shape you size, and a vague request can swing from small to large depending on the shape assumed.

## Step 3: Map the codebase surface it touches

Search the repo for the area(s) involved: the existing API/config surface, the package(s) that own it, and any extension points that already generalize toward what's being asked. For a monorepo, list every workspace whose public API, exported types, or config schema would need to change — not just the one the issue happened to be filed under.

Signals:

- Existing config/option plumbing it could hook into, no call-site changes → pulls toward "small".
- Shared types/interfaces used by more than one package that would need to change → pulls toward "medium" or "large".
- Public API signatures, exported types, CLI flags, or documented behavior changing incompatibly for existing users → pulls toward "large" regardless of how small the diff looks.

## Step 4: Classify the size

Escalate only — a request that's mostly small but has one large-sized element (e.g. one breaking type change) is large, full stop, not "small with an asterisk."

- **Small** — additive, backward-compatible, confined to one package/file: a new config option with a safe default, a new optional parameter, a new export alongside existing ones. Existing callers are unaffected if they change nothing.
- **Medium** — still additive/non-breaking, but the surface spans multiple packages or files: plumbing through a shared type, a new package, or coordinated changes across a monorepo's workspaces. No caller breaks, but more than one place needs to adapt.
- **Large** — any of: a breaking change to an existing public API, config shape, exported type, or documented behavior; blast radius reaching most/all consumers (a default behavior change, a new required integration step); needs an RFC/design doc, a deprecation window, or a migration guide before or alongside implementation; needs proactive user comms (blog post, changelog highlight, social post) rather than a routine changelog line.

State the classification plus the 1-2 concrete reasons driving it — the specific breaking surface, package count, or comms need. Not "this seems big."

## Step 5: Recommend next steps matching the size

- **Small** → safe to scope directly into an implementation plan; no extra process needed.
- **Medium** → name every package/file that needs touching before implementation starts, and flag whether the cross-package design needs a second pair of eyes first.
- **Large** → don't recommend jumping to implementation. Call out what breaks and for whom, whether a deprecation path is possible instead of a hard break, and that an RFC/announcement needs drafting and agreement before (or alongside) the code. Name the audience this project actually uses for breaking changes rather than assuming a channel.

## Step 6: Present the analysis

Show the user: what's being asked, the size classification with its reasons, the affected packages/files, and the matching recommendation from Step 5. This skill's job ends here — no implementation, and nothing posted to GitHub unless the user asks to share it.

- Sized from an existing issue → if asked to share it, draft the comment, show it, and only post after confirmation: `gh issue comment <number> --body "<confirmed analysis>"`
- Sized from a plain-text description → nothing to comment on yet, and `issue-create` only drafts bug reports, not feature requests. If the user wants it filed, draft a title/body from the analysis (matching the repo's feature-request template if it has one), confirm with the user, then `gh issue create`.

## Also stop instead of proceeding

- User asks you to implement it, not just size it → out of scope here; this skill sizes the request, it doesn't hand off into an implementation flow.
- A drafted comment or issue hasn't been confirmed → never post it, even if the analysis looks complete.
