# Fallback to a general-purpose subagent

How a skill proceeds when `pr-oracle` or `pr-sidekick` cannot be spawned by name. The skill still hands the work to a subagent: a `general-purpose` one carrying the named agent's contract. Inline is the last resort, not the default.

This extends `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent". It adds no new decisions to a skill: ordering, gates, retry bounds, and who commits or pushes stay as the skill says.

## When it applies

Use it when the host has a subagent tool but the named agent is unavailable. Typical causes:

- The skill runs without `cops` (an `oss` skill, or the skills copied on their own), so `cops:pr-oracle` and `cops:pr-sidekick` do not exist.
- The host (for example a cloud agent) does not load `cops/agents/`.
- The named agent fails to start and nothing has run yet.

It does not apply:

- **No subagent tool.** Run the step inline and mark `inline (no subagent capability)`.
- **Failure after work began** (edits, commits, a push, a posted comment). Never respawn as a fallback; the skill's own failure handling applies (bounded retries, `Resuming:`, or ask the user).

Never stop, or ask the user to install the plugin, because an agent is missing.

## How to run it

1. **Spawn `general-purpose`** with the model the named agent would have taken: the call's tier from `CONVENTIONS-orchestration.md` ("The caller picks the model by tier", and the oracle mode table), passed as that section says.
2. **The prompt is the contract preamble below, then the skill's filled template.** Nothing else: no transcript, diff, or skill copy. The preamble stands in for the agent file, so it works even when that file is absent.
3. **Read the result as the named agent's.** Same lines, same checks: a sidekick fallback returns `applied:` / `not applied:`, and main chat compares those IDs with its `Rules that apply:` line.

### Sidekick preamble

```
Act as pr-sidekick for the one scoped job below. Do exactly what it says, in its order.
- Never read or write memory and never consult pr-oracle. The only remembered rules are those in this prompt (`Rules that apply:` or the brief). Don't go looking for memory files.
- Stay inside the ask: no drive-by refactors, renames, or formatting.
- Commit, push, reply, or post only where this prompt says so. Never amend, squash, force-push, skip hooks, resolve a thread, edit a PR title or body, or open a PR or issue.
- GitHub only through `gh api` REST in Bash, never MCP or `gh pr` / `gh issue`.
- At most 3 attempts at anything to keep going "until". Then stop, leave the work uncommitted, and report what was tried and what still fails.
- You cannot ask the user. Return a question as your result; on `Resuming:` check what is already committed or pushed first.
- Return only the requested lines, plus `applied: <rule IDs or none>; not applied: <ID> (<why>) or none`, and `deviations:` when you made a small decision.
```

### Oracle preamble

Only when the mode's reference files (`cops/references/pr-oracle/`) are readable on the host. Otherwise there is nothing to carry, so perform the step inline and mark `fallback`, as "Consulting the `pr-oracle` agent" says.

```
Act as pr-oracle for the mode(s) below. Read the mode file(s) under the references directory first, then follow their job and output exactly.
- Never edit product repositories or GitHub. Only `learn-feedback` writes memory, and only under `memory/users/<memory-login>/` and `memory/team/` of the memory root. Never clone, pull, commit, or push memory.
- Read GitHub only through read-only `gh api` REST calls, never MCP.
- Never ask the user; flag decisions you cannot support.
- End with the `loaded:` line and any `promote:`, `conflict:`, or memory suffixes.
```

Pass the oracle fallback `memory-root` and `memory-login` exactly as the SessionStart context gives them. Never pass either to a sidekick fallback.

## Reporting

Under "Handoffs in the final report", name the fallback on the step's line, for example `- fix loop ✓ (general-purpose in place of pr-sidekick)`. The PR panel already labels these rows `🤖 general-purpose`.
