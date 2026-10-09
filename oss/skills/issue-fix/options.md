# Root-cause options

Use this file after rerunning the checkpoint test and before any implementation. The goal is to determine whether the failure is ours or a dependency's, then offer a meaningful choice.

Delegate per `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent":

```text
Trace the failure without editing code.
Failing test: <path>
Failure summary: <stack trace, assertion diff, and error type>
Package map: <scout-repo map or "discover it">

Return:
- classification: ours or dependency;
- exact responsible function/file and evidence;
- if dependency: direct/transitive dependency name, resolved version, exact source function/file, and matching upstream issue/changelog when available;
- 2–3 fix options appropriate to that classification;
- for each option, in 1–2 lines: what changes, blast radius, risk, and rough effort.
```

The root cause is **ours** only when it originates in this repository's code path. It is a **dependency's** when it originates in direct or transitive dependency code; identify the dependency and version rather than stopping at the first repository stack frame.

Shape options by classification:

- Ours → direct fix; narrower/defensive fix; larger refactor that prevents the bug class.
- Dependency → upgrade to a released fix; local patch/lockfile override or vendored patch tied to an upstream issue; workaround in this repository's code.

Offer only options supported by evidence. For example, do not offer an upgrade without a release containing the fix, or a patch strategy the package manager cannot support. If root cause remains unclear, return `ROOT_CAUSE_UNCLEAR`; do not manufacture options. Return the supported options to the orchestrator; it owns presenting them and enforcing the user-selection gate.
