# Feature sizing path

Use this path only after `SKILL.md` classifies the issue as a feature. This is a read-only survey: never implement, run or write tests, edit code, commit, or push.

## Pin down the request

Restate the requested behavior, option, or capability and its use case. If it is only “would be nice to have X” without a shape, preserve that ambiguity; sizing depends on the shape.

## Survey prompt

Delegate the reading per `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent". Pass the capability and the `scout-repo` package map when available:

```text
Survey the codebase surface for this feature request; do not run or write tests and do not edit files.
Requested capability: <behavior, option, or capability>
Use case: <use case or "unclear">
Package map: <map or "discover it">

Return in a few lines:
- existing API/config surface and extension points that already generalize toward the request;
- owning files/packages and every workspace whose public API, exported types, or config schema would change;
- likely call-site and consumer blast radius;
- whether the change can be additive and backward-compatible;
- any public API signature, exported type, CLI flag, config shape, or documented behavior that would change incompatibly;
- whether it needs an RFC/design decision, deprecation/migration path, or proactive user communication.
```

Size from that answer. Do not re-read the files the survey read.

## Evidence rubric

- Existing option/config plumbing with no call-site changes pulls toward small.
- Shared types/interfaces consumed by multiple packages pull toward medium or large.
- An incompatible change to public APIs, exported types, CLI flags, config, or documented behavior is large even if the diff is small.
- List every affected workspace, not only the package named by the issue.
- Do not infer compatibility or user impact without a concrete surface or consumer.
- If a dependency owns the needed extension point, record its name/version and whether support already exists upstream. Released support is sized by the local integration; missing support that requires a patch, fork, or public workaround contributes its actual cross-package and contract risk. Do not treat dependency internals as this repository's files.

## Classify size

Escalate only: one large element makes the whole feature large.

- **Small** — additive, backward-compatible, and confined to one package/file: a safe-default config option, optional parameter, or new export. Existing callers that change nothing are unaffected.
- **Medium** — additive and non-breaking but spans files/packages, such as shared-type plumbing, a new package, or coordinated monorepo changes.
- **Large** — breaks an existing public API, config shape, exported type, or documented behavior; reaches most consumers; needs an RFC/design doc, deprecation window, or migration guide; or needs proactive communication such as a highlighted changelog, blog, or social post.

State the classification and 1–2 concrete evidence-backed reasons, never merely “this seems big.”

## Recommend

- Small → safe to scope into an implementation plan.
- Medium → name every package/file before implementation and say whether cross-package design needs another reviewer.
- Large → do not recommend immediate implementation. Identify what breaks and for whom, whether deprecation can replace a hard break, the RFC/announcement requiring agreement, and the audience/channel this repository actually uses.

Return requested behavior/use case, affected surfaces/packages/files, compatibility and communication impact, size with reasons, and recommendation to `SKILL.md`.
