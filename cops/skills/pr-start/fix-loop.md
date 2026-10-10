# pr-start: fix loop and sweep follow-up

Read this only after the user confirmed the task card in Step 3, immediately before the first edit, test, or commit.

## Oracle order

1. `scout-repo` + `brief-task` (`for: pr-sidekick`) — Step 2, one call, before the card. Re-run `brief-task` alone only if a card edit changed the Goal or likely files.
2. The fix loop runs with the brief already in its prompt; the sidekick never calls the oracle.
3. `sweep-diff` — Step 5, over the loop's commits, before any push.
4. `learn-feedback` — a separate call, only after the user explicitly asks to remember something.

Each call gets `memory-root:` / `memory-login:` from session context (`CONVENTIONS-orchestration.md` → "Consulting the `pr-oracle` agent"). The sidekick prompt gets neither.

## Fix-loop handoff

Spawn `cops:pr-sidekick` on Claude Code, or the `pr-sidekick` subagent on Cursor. Model: `sonnet` when the card's scope is one package or a few files; unset when the Approach spans packages or needs design judgment. Note the commit before the loop (`git rev-parse HEAD`) for the sweep.

```text
Repo <owner>/<repo>, branch <branch> (checked out), base <default branch>.
login: <login>
Goal: <card Goal>
Approach: <card Approach, or the chosen option's Changes line>
In scope: <card In scope bullets, joined with "; ">
Out of scope: <card Out of scope bullets, joined with "; ">
Done when: <card Done when>
Bug: <"yes — <reported behavior>" | "no">
Rules that apply: <the brief's lines, without "caller only:" lines, or "none">
Tests: <the profile's test command, or "find out">
GitHub: <"gh" | "MCP — use the GitHub MCP tools in your tool list instead of gh; load each with ToolSearch first if needed">
Resuming: <"no" | the question you returned last time, and the user's answer>

Bug: yes → write the Done when test first, run it, and confirm it fails
for the reported reason before changing any other code. It fails for a
different reason, or passes → stop and return that as a question.
Then implement the Approach inside the scope, running the affected tests
with a quiet reporter, until Done when holds — at most 3 attempts. Still
failing → stop, leave everything uncommitted, and return what you tried
and what still fails.
Stop and return a question instead of guessing when the change needs
anything out of scope, a public API, security/auth, or config/infra
decision the card doesn't name, or dropping or rewriting an existing test.
When resuming, use the answer and check `git status` and `git log` first;
don't redo a commit that already exists.
Commit once Done when holds, in the repo's commit style:

  <type>: <short description>

  <one or two lines on why>

  Skill: cops:pr-start
  Approved-by: <login>

Do not push, open a PR, or edit any PR or issue.
Return at most 5 lines: committed (sha, one-line summary) | uncommitted,
Done when result (test name: fail before → pass after, or the behavior
observed), other tests run → pass | fail (names) — or the question.
```

Fill `Approved-by:` with the login from Step 1; the user's card confirmation is the approval (`CONVENTIONS-pr-metadata.md` → "Commit trailers"). Host trailers follow the block without a blank line.

A question → ask the user, then spawn again with `Resuming:` filled in; the same 3-attempt bound carries over. A reply that says Done when holds without a failing-before result on a bug → treat it as incomplete and ask the user before Step 5.

No subagent capability → run the same steps here, in the same order, and mark `fix loop` as `inline (no subagent capability)`.

## Bug: test first

For a bug, the failing test is the contract. It must:

- live where the profile says tests live, named after the behavior, not the issue number;
- fail before the fix for the reported reason — an assertion on the reported behavior, not an import error, typo, or missing fixture;
- pass after the fix, with nothing else changed to make it pass.

A bug that can't be reproduced in a test → stop and bring the attempt to the user; a manual check replaces the test only if the user says so, and then the card's Done when names that check.

## Sweep follow-up handoff

Only for in-scope `sweep-diff` flags, once. Same agent and model as the loop:

```text
Repo <owner>/<repo>, branch <branch> (checked out).
login: <login>
Commits: <sha list from the fix loop>
Flags to fix:
1. <path>:<line> — <what's wrong> — rule: <rule>
2. ...
Rules that apply: <same as the fix loop>
Tests: <same as the fix loop>
Fix only these flags, inside the lines the commits touched. Run the
affected tests, at most 3 attempts. Commit the fixes as one commit with the
same trailer block as the fix loop. A flag that needs more than its own
lines → skip it and say why.
Do not push.
Return one line per flag: fixed (sha) | skipped (why) — then one line for
the test run.
```

Skipped flags go to the user before Step 6. After this follow-up, SKILL.md Step 5 sweeps its commit once more before Step 6.
