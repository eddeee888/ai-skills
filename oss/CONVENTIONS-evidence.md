# Shared conventions: evidence

Evidence shows a reviewer a change before and after, per card scenario.

## Evidence scenarios: `Evidence: <kind> — <scenario>, … | none — <why>`

- **Scenario**: one named case a reader would see change, e.g. `autopilot running` or `POST /pets 400 bad payload`. Max 5 per PR.
- **Kind**: `ui`, `api`, `cli` or `architecture`. `api`/`cli` run only against a local or ephemeral environment the repo's scripts start, with no real credentials; else `manual`. A user runs any `deploy` commands, never the agent.
- The task card always carries the line (it is required), user-confirmed: scenarios, or `none — <why>` (no such surface, or no tooling).
- Before/After demonstrates and never replaces Verification (`CONVENTIONS-verification.md` → "Before and After").

## Evidence manifest: `<slug>/manifest.json`

One manifest per PR records what each capture was taken from. It is a collapsed `<details>` block in the PR body, the source of truth:

```json
{ "base": "a1b2c3d", "scenarios": [{
  "name": "stopped-at-address", "kind": "ui",
  "how": "pnpm exec playwright test autopilot.spec.ts -g stopped",
  "touches": ["cops/hooks/cops.tsx"],
  "before": { "file": "stopped-at-address.before.png", "at": "a1b2c3d" },
  "after": { "file": "stopped-at-address.after.png", "at": "8b23beb" },
  "status": "captured" }] }
```

- `how` uses only the repo's own tooling; install nothing.
- **Stale**: `git diff --quiet <after.at> HEAD -- <touches>` exits non-zero. The before is pinned to the base and goes stale only when the base moves.

## Evidence status: `captured` | `captured-by-user` | `drawn` | `mock` | `manual` | `not-captured`

| Status | Meaning |
|---|---|
| `captured` | taken from the real thing by the agent |
| `captured-by-user` | a `manual` scenario's output pasted back, or a screenshot dropped by the user into the PR body |
| `drawn` | an architecture diagram derived from the diff, not a running system |
| `mock` | a hand-made demonstration, never presented as a capture |
| `manual` | needs the user to run something; the PR carries the commands |
| `not-captured` | tried and failed, or no tooling; the reason is stated |

The PR body shows each scenario's status under `### Before` and `### After`.

## Where evidence lives: scratch and the PR body

- **Folder**: `<slug>`, the branch name with `/` replaced by `-`, in scratch.
- **Scratch**: `$(git rev-parse --git-dir)/cops/evidence/<slug>/`, captures in progress and the draft manifest, local only.
- **Never the working tree or the PR branch**: no `.cops/` folder, no `.gitignore` change. Nothing is pushed for evidence.
- Before captured `api`/`cli` text goes into the body, scan it for `Authorization`, `Bearer`, `Set-Cookie`, `api[_-]key` headers, token-shaped values and private-key blocks. A hit lists `path:line`, posts nothing, the scenario becomes `not-captured — possible secret`. A backstop, not a guarantee.
- The main chat writes the manifest at pr-start Step 5b from the capture handoffs' lines. A screenshot goes to scratch; the body says `pending: drop <name>.png here` until the user's drop makes it `captured-by-user`.
- Evidence of a merged or closed PR stays; pruning is a human decision.

## Staleness is not a `sweep-diff` check

`sweep-diff` flags only remembered-rule matches. The skill that recaptures runs the stale check itself.
