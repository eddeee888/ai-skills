# Bug sizing path

Use this path only after `SKILL.md` classifies the issue as a bug. This is a read-only code survey: never reproduce the bug, run or write a test, edit code, commit, or push.

## Pin down the report

Restate observed versus expected behavior. If expected behavior is unclear, say so rather than guessing.

## Survey prompt

Delegate the reading per `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent". Pass observed and expected behavior, any named entry point, and the `scout-repo` package map when available:

```text
Read only the code path for this reported bug; do not run or write tests and do not edit files.
Observed: <observed behavior>
Expected: <expected behavior or "unclear">
Named entry point: <entry point or "none">
Package map: <map or "discover it">

Return in a few lines:
- suspect function(s), files, conditions, and every implicated package;
- likely root cause plus confidence, using "likely X, possibly Y" when evidence is not conclusive;
- whether the cause is ours or a dependency's;
- for a dependency: name, resolved version, exact source function/file, and matching upstream issue or changelog evidence when found;
- public/documented behavior or output contracts a correct fix could change.
```

Size from that answer. Do not re-read the files the survey read.

## Evidence rubric

- An isolated bad condition or edge case in one function pulls toward small.
- A shared helper, shared type/interface, or behavior repeated across consumers pulls toward medium or large.
- A change to documented behavior, public API contract, or relied-on output is large even when the code diff would be tiny.
- Dependency-rooted means the evidence reaches the dependency's source or a matching upstream issue/changelog; suspicion based only on a stack frame is not enough. Record the dependency and version.
- If the code does not identify one location, preserve uncertainty rather than claiming a root cause.

## Classify size

Escalate only: one large element makes the whole bug large; never report “small with an asterisk.”

- **Small** — once verified, confined to one function/file with no documented/public contract change, such as a missing null check, off-by-one, or wrong condition.
- **Medium** — touches a shared helper or more than one package/file without changing the documented contract for callers that do not hit the bug.
- **Large** — changes documented/public behavior relied on by other code, is tangled into a core assumption spanning packages, or requires a design decision before code.
- **Dependency-rooted** — an upstream release already fixes it: small version bump. No upstream fix but a local patch/override plus tracked upstream issue works: medium. No upstream fix and this repository's public API needs a workaround: large.

State the classification and 1–2 concrete reasons tied to the hypothesis. Dependency sizing previews the options `issue-fix` will offer; do not choose or re-litigate them here.

## Recommend

Say that this survey has not confirmed the bug.

- Already filed → recommend `issue-verify`, carrying the size and root-cause hypothesis.
- Not filed → recommend `issue-create` with the hypothesis, then `issue-verify`.
- Large → identify the design ambiguity or behavior-contract question that must be resolved before `issue-fix`.

Return observed/expected behavior, hypothesis, evidence and confidence, implicated packages/files, size with reasons, and recommendation to `SKILL.md`.
