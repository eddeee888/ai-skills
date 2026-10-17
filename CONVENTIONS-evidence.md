# Shared conventions: evidence

Evidence shows a reviewer what a change looks like before and after, for each scenario the task card names.

## Evidence scenarios: `Evidence: <kind> — <scenario>, … | none — <why>`

- **Scenario**: one named case a reader would see change, e.g. `autopilot running` or `POST /pets 400 bad payload`. At most 5 per PR.
- **Kind**: `ui`, `api`, `cli` or `architecture`. A repo profile may list `deploy` commands: the repo's own commands for a shared environment, which a user runs, never the agent.
- The task card always carries the line (it is required), user-confirmed: scenarios, or `none — <why>` when the change has no UI, API, CLI or architecture surface, or the repo has no tooling.
- Before/After demonstrates and never replaces Verification (`CONVENTIONS-verification.md` → "Before and After").

## Evidence manifest: `<pr>/manifest.json`

One manifest per PR records what each capture was taken from; `file` is relative to it:

```json
{ "pr": 89, "base": "a1b2c3d", "scenarios": [{
  "name": "stopped-at-address", "kind": "ui",
  "how": "pnpm exec playwright test autopilot.spec.ts -g stopped",
  "touches": ["cops/hooks/cops.tsx"],
  "before": { "file": "stopped-at-address.before.png", "at": "a1b2c3d" },
  "after": { "file": "stopped-at-address.after.png", "at": "8b23beb" },
  "status": "captured" }] }
```

- `how` uses only the repo's own tooling; nothing is installed to capture.
- **Stale**: `git diff --quiet <after.at> HEAD -- <touches>` exits non-zero. The before is pinned to the base and goes stale only when the base moves.

## Evidence status: `captured` | `captured-by-user` | `drawn` | `mock` | `manual` | `not-captured`

| Status | Meaning |
|---|---|
| `captured` | taken from the real thing by the agent |
| `captured-by-user` | a `manual` scenario's output the user ran and handed back |
| `drawn` | an architecture diagram derived from the diff, not a running system |
| `mock` | a hand-made demonstration, never presented as a capture |
| `manual` | needs the user to run something; the PR carries the commands |
| `not-captured` | tried and failed, or no tooling; the reason is stated |

Once the PR body renders evidence it shows each scenario's status; until then the task card is the record.

## Where evidence lives: scratch and `cops-evidence`

- **Scratch**: `$(git rev-parse --git-dir)/cops/evidence/<pr>/`, captures in progress and the draft manifest, local only.
- **Published**: orphan branch `cops-evidence`, under `<pr>/`. Its manifest is the source of truth, read with `git show origin/cops-evidence:<pr>/manifest.json` and written from a temporary `git worktree` outside the repo, in one commit and push separate from the PR branch's. The PR body links files by commit SHA.
- **Never the working tree or the PR branch**: no `.cops/` folder, no `.gitignore` change. Publishing impossible → scratch only, and the PR says `Evidence: not published — <reason>`.
- Captures are scanned for secrets before publishing; a hit stops the capture. Evidence of a merged or closed PR stays; pruning is a human decision.

## Staleness is not a `sweep-diff` check

`sweep-diff` flags only matches of remembered rules, so staleness would break its contract. The skill that recaptures runs the manifest's stale check itself, deterministically, with no oracle call.
