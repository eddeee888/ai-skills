# Shared conventions

Formatting/process rules shared across this marketplace's skills, or
between a skill and the `pr-oracle` checks that enforce it. Skills point
here instead of restating a rule, so a change here reaches every skill.
Each pointer names its section (`CONVENTIONS.md` → "<section>"); read only
that section, not the whole file.

An installed plugin gets only its own directory, so each plugin carries an
identical copy of this file at its root, two levels up from each
`SKILL.md`. Edit the copy at the repo root, then copy it over
`cops/CONVENTIONS.md` and `oss/CONVENTIONS.md`.

## Defaults and contracts

Each section below is one of two kinds:

- **Default** — a style choice, marked *Default* under its heading. Apply it
  unless something stronger says otherwise. From strongest to weakest: the
  user's ask in the current conversation; the repo's own `CLAUDE.md` or
  `CONTRIBUTING.md`; the team's remembered rules; the user's remembered
  rules; this file. The `pr-oracle` agent's `scout-repo` profile lists every
  default the repo or memory overrides on its `overrides:` line — follow that
  line, and the current conversation over it.
- **Contract** — every other section. Skills and agents depend on it (a
  branch name they search for, how text reaches the shell, how they call
  each other), so nothing overrides it. An override asked for anyway → tell
  the user why it can't apply, and follow the contract.

## Monorepo title prefix: `[package-name]`

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

In a monorepo, lead a PR title with `[package-name]`, naming the package
the change is rooted in — e.g. `[package-name] fix: ...`. Spanning several
packages → name only the one with the primary/root-cause change, not a
list. PR titles only; issue titles aren't package-prefixed.

Used by: `cops:pr-sync` (title), `oss:issue-verify` (checkpoint PR title),
`oss:issue-fix` (fix PR title).

## Trailing issue reference in the PR title: `(#123)`

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

A PR title's issue reference goes at the end, in parens —
`fix: <description> (#123)` — never mid-title. A resync keeps an existing
trailing reference.

Used by: `oss:issue-verify`, `oss:issue-fix` (titles), `cops:pr-sync`
(preserving it on resync).

## Non-closing issue references: `Relates to #123` / `Refs #123`

A PR that doesn't fully resolve its issue on merge — a checkpoint PR, or a
fix PR still under review — uses a non-closing keyword (`Relates to #123` /
`Refs #123`), never `Fixes`/`Closes`, so the issue stays open until a
maintainer closes it.

A resync preserves whichever keyword is there; never change `Relates
to`/`Refs` to `Fixes`/`Closes` or the reverse — whether the PR closes the
issue isn't a resync's call.

Used by: `oss:issue-verify`, `oss:issue-fix`, `cops:pr-sync` (Resources —
preserving the existing keyword).

## Checkpoint/fix branch naming: `repro/<issue-number>` / `fix/<issue-number>`

A checkpoint (failing-test) branch is `repro/<issue-number>`; a fix branch
built on it, when it needs its own, is `fix/<issue-number>`, so each fix
pairs visibly with its checkpoint.

Used by: `oss:issue-verify` (checkpoint branch), `oss:issue-fix` (fix
branch).

## Bold the critical claim in Why/What/Verification bullets

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

Bold (`**...**`) the one fact in a bullet that matters — the causal reason,
the chosen rationale, a caveat — not the whole sentence. E.g. "This fails
because **component A fails to request component B**" or "Found issue D.
**Not fixed in this PR.**" Nothing critical enough → no bold.

Used by: `cops:pr-sync` (Why/What/Verification).

## Split What into Main and Drive-by

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

A PR whose diff carries a drive-by (a change the task doesn't need,
"Author notes") → split the description's What into `### Main` (the task's
change) and `### Drive-by` (one bullet per drive-by, saying why it's in
this PR), so a drive-by can't hide among the main bullets. No drive-by →
plain bullets, no subsections.

Used by: `cops:pr-sync` (What).

## Verification checklist: name the test type, not the command

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

A check that ran the same way in CI → name the kind of test, not the
command: `- [x] Unit tests`, not `- [x] Ran \`pnpm test\``. Use the literal
command only for something run manually, beyond what CI covers.

Used by: `cops:pr-sync` (Verification).

## Don't checklist an intentionally-failing check as done

A branch's tests failing on purpose — a checkpoint commit with no fix yet,
not a broken build — → say so instead of checking it off:
`- [ ] Unit tests — intentionally failing, reproduces the bug`, never
`- [x]`. A checked box reads as "this works"; a checkpoint doesn't, yet.

Used by: `cops:pr-sync` (Verification), regardless of which skill produced
the branch.

## Hand long loops to a subagent

An implement/test/commit loop, a write-and-run test loop, a code survey, research, or a rebase-and-draft is tens of steps. On a host that resends the whole conversation every step (Cursor does), each step in the main chat pays for everything already in it — hundreds of thousands of tokens late in a long session. A subagent's conversation holds only its prompt, so the same loop costs a fraction. A skill that hands a loop off supplies the prompt template; these rules hold for all of them:

- **Required, not a judgment call.** When a skill names a handoff and the host can spawn a subagent, make the handoff, every time. A small diff, code already read in this chat, or a one-line edit is no reason to do it in the main chat. If a handoff looks like pure overhead, say so in one line and ask the user; never skip it silently.
- **Which agent.** Work that edits, runs, or pushes → the `pr-sidekick` agent (`cops/agents/pr-sidekick.md`): `cops:pr-sidekick` on Claude Code, the `pr-sidekick` subagent on Cursor. It applies the user's remembered preferences and follows the template's limits itself; pass it `login: <github-login>` when the skill has it. The `cops` plugin isn't installed ("Companion plugin: `cops`") → the `general-purpose` agent on Claude Code, a subagent on Cursor. A read-only survey or research → the `Explore` agent on Claude Code, a subagent on Cursor.
- **The caller picks the model.** The subagent can't change its model, and only the main chat knows how hard the job is. On a host that takes a model per call (Claude Code's `model`), pass `haiku` for a mechanical job (a literal rename, move, or suggestion block — say "mechanical" in the prompt too), `sonnet` for a scoped change or a survey, and leave it unset (the main chat's model) for work needing judgment across files. A job that's mostly design isn't a loop to hand off — do it in the main chat.
- **The prompt is only the template, filled in** — no transcript, no PR diff, no copy of the skill, nothing the template doesn't ask for. The subagent fetches anything else itself.
- **It can't consult the oracle.** Get what's needed from the `pr-oracle` agent in the main chat first and paste its output into the prompt.
- **One at a time on a shared checkout.** Subagents that edit the same checkout never run in parallel.
- **Short results.** It returns only the few lines the template asks for, and returns a question instead of guessing when a decision is the user's; the main chat asks the user and spawns it again with the answer.
- **Every spawn and check is a main-chat step.** Keep them few — batch where the skill says to.
- **Bounded retries.** A template that says to keep going "until" a test passes or fails the right way allows at most 3 attempts. Still not there after the third → stop, leave the work uncommitted, and return what was tried and what's still failing. The main chat takes that to the user; it doesn't respawn the same loop unasked.
- **Resume, don't restart.** A respawn after a question carries the question and the answer; the subagent picks up at the step that asked, checking what's already done (rebased, committed, pushed) rather than redoing it.
- **No way to spawn a subagent** means the host has no subagent tool at all, not that one seems unnecessary → do the same steps in the main chat, and mark them `inline` on the handoffs list ("Handoffs in the final report").

Used by: `cops:pr-address` (5a batches, 5b research), `cops:pr-sync` (Steps 2–6),
`cops:pr-review` (context check), `oss:issue-fix` (root cause, implementation),
`oss:issue-verify` (the failing test), `oss:issue-analyze` (code survey).
`pr-sidekick` follows its model and retry rules.

## Handoffs in the final report

A skill that names subagent or `pr-oracle` handoffs ends its final report with a `Handoffs:` list: one bullet per handoff that applied this run, in the order the skill runs them. Each skill names its labels at its wrap-up step. For example:

```markdown
Handoffs:
- scout-repo ✓
- root cause ✓
- brief-task ✓
- fix loop ✓
- sweep-diff ✓
```

- `✓`: ran as the skill says.
- `inline (<reason>)`: done in the main chat because the host couldn't make the handoff. The only valid reasons: it has no subagent tool, or the `cops` plugin isn't installed so the oracle doesn't exist.
- `✗ (<reason>)`: skipped, and only because the user agreed.

Leave out a handoff that didn't apply this run (e.g. no authoritative threads means no 5a batch). Writing the list is the check: if the honest mark would be `✗` without the user's agreement, or `inline` for any other reason, go back and make that handoff before reporting.

Used by: `cops:pr-address` (Step 6), `cops:pr-sync` (Step 7), `cops:pr-review`
(Step 7), `cops:pr-note` (Step 6), `oss:issue-analyze` (Step 6), `oss:issue-create` (Step 7),
`oss:issue-verify` (Step 6), `oss:issue-fix` (Step 7).

## Companion plugin: `cops`

The `oss` plugin works on its own. With the `cops` plugin installed too, `oss` skills use three things it ships: the `pr-oracle` agent, the `pr-sidekick` agent, and the `pr-sync` skill. `cops`'s own skills can take all three as given.

- **How to tell.** `cops` is installed when its names exist in this session: `cops:pr-oracle`, `cops:pr-sidekick`, and `/cops:pr-sync` on Claude Code; the `pr-oracle` and `pr-sidekick` subagents and `/pr-sync` on Cursor. Check once, when the skill first needs one, and keep that answer for the run. Cursor itself is never "missing".
- **Missing → fall back, never stop**, and don't ask the user to install `cops`:
  - `pr-oracle` → do that step inline, exactly as the skill describes ("Consulting the `pr-oracle` agent"), and mark it `inline (cops plugin isn't installed)` on the handoffs list ("Handoffs in the final report").
  - `pr-sidekick` → the `general-purpose` agent on Claude Code, a subagent on Cursor ("Hand long loops to a subagent").
  - `pr-sync` → say the PR's title and description need updating by hand, and don't name `/cops:pr-sync` ("Suggesting next steps").
- **Defaults without the oracle.** No profile means no `overrides:` line. Before applying a *Default* section, check the repo's `CLAUDE.md` and `CONTRIBUTING.md` for a rule that says otherwise, and follow it ("Defaults and contracts").

Used by: `oss:issue-analyze`, `oss:issue-create`, `oss:issue-verify`,
`oss:issue-fix`.

## Comment labels: bold when writing, either form when reading

Every inline comment a skill posts opens with its label — `Question:`,
`Suggestion:`, `Issue:`, `Test:`, `Note:`, `Drive-by:` — written in bold
(`**Note:** inlined the parser, since this is its only caller`), so the
kind stands out when scanning a thread.

A skill that recognises a comment by its label matches it with or without
the bold: `Note:` and `**Note:**` are the same label, so comments posted
before this rule still count.

A reply a skill posts in a thread (`cops:pr-address`'s summary or answer)
never opens with a label, so a signed reply reads as a reply ("Skill
signature").

Used by: `cops:pr-review`, `cops:pr-note` (writing); `cops:pr-address`,
`cops:pr-note`, "Author notes", "Skill signature", "Suggesting next steps"
(reading).

## Comment body: short, one point per bullet

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

Every comment a skill posts to GitHub — an inline comment, a thread reply,
a review's top-level body, an issue comment — is as short as what it has to
say, so the reader gets each point without picking it out of a paragraph.

- **One point** → one or two sentences.
- **More than one point, or more than one source** → one sentence with the
  answer, then a bullet list. One point per bullet, with its source at the
  end of that bullet ("Citing sources"), not woven into a sentence with the
  others.
- **Cut** what the reader already has: the question restated, what the diff
  or thread already shows, hedges, a closing line that repeats the bullets.
- The label, when there is one, stays the first line and isn't repeated on
  the bullets ("Comment labels"). The signature stays its own paragraph
  after everything else ("Skill signature").

Issues and PR descriptions follow their own templates, not this section.

Used by: `cops:pr-review`, `cops:pr-note`, `cops:pr-address`,
`oss:issue-analyze`, `oss:issue-verify`.

## Citing sources: a link readers can open

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces it ("Defaults and contracts").

Every source a skill cites in text it posts to GitHub — an inline comment,
a thread reply, a review body, an issue, an issue comment, a PR title or
description — is a link, and one the post's readers can open.

- **Code** → a GitHub permalink pinned to a commit
  (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<line>`), with
  `` `<owner>/<repo>` `<path>:<line>` `` as the link text, so the line
  stays right after the file changes. A path with no link isn't a source.
- **Anything else** → its URL.
- **Readers can open it.** A source counts only when it's in the PR's or
  issue's own repo, a public repo, or at a public URL. Check a repo with
  one call per distinct repo (`gh api repos/<owner>/<repo> --jq .private`,
  or `get_file_contents` on the MCP route); judge any other URL by its host
  without fetching it, and treat it as private when unsure. Anything else —
  another private repo, an internal doc, a sign-in-only page — stays out of
  the post and goes to the user in-session. Answer from what the public
  sources show, or say plainly that the backing is private.
- **Already referenced.** A link the PR or issue already carries — its
  issue-tracker reference, a link in its existing body or commits — stays,
  even if private: its readers already have it.

Used by: `cops:pr-review`, `cops:pr-note`, `cops:pr-address`,
`cops:pr-sync`, `oss:issue-analyze`, `oss:issue-create`,
`oss:issue-verify`, `oss:issue-fix`.

## Skill signature: `<sub>_Skill: [<plugin>:<skill>](…)_</sub>`

*Default* — the user's ask in this conversation, or an `overrides:` line in the `pr-oracle` profile naming this section (without the oracle: a different rule in the repo's `CLAUDE.md` or `CONTRIBUTING.md` — "Companion plugin: `cops`"), replaces the writing rule; the reading rule always applies ("Defaults and contracts").

**Writing.** Every comment body a skill posts to GitHub — an inline comment, a thread reply, a review's top-level body, an issue, an issue comment — ends with one small italic line, like the `Generated by Claude Code` footer: `Skill:` and the skill with its plugin, linked to its source:

```markdown
<sub>_Skill: [cops:pr-review](https://github.com/eddeee888/ai-skills/tree/main/cops/skills/pr-review)_</sub>
```

When the user approved this post, add `· Approved:` and their GitHub login (`gh api user --jq .login`, or `get_me`) inside the italics, as a plain profile link — no `@`, so it isn't a mention:

```markdown
<sub>_Skill: [cops:pr-review](https://github.com/eddeee888/ai-skills/tree/main/cops/skills/pr-review) · Approved: [<login>](https://github.com/<login>)_</sub>
```

- **Approved** means the user OK'd this post or the work it reports: they confirmed the drafted text, or gave the go-ahead the skill acts on (`cops:pr-address`'s thread go-ahead, or a Step 4 answer). A skill that posts without asking (`cops:pr-note`) leaves the `Approved:` part out.
- **Placement.** Its own paragraph, after everything else in the body, including a ```suggestion``` block (never inside one). The review body is empty → leave it empty; don't post a body just to sign it.
- **A host footer goes last.** A host that requires its own footer on every post (Claude Code's `Generated by Claude Code` line) gets it after the signature, unchanged; never edit that footer or put text after it.
- **Multi-line.** A signed body is never one line, so it goes through a file on the `gh` route ("Passing drafted text to `gh`").
- PR titles and descriptions aren't signed.

**Reading.** A comment whose last line (before any host footer) is a signature in this format — a `<sub>` line reading `Skill: <plugin>:<skill>`, linked into `github.com/eddeee888/ai-skills` — was posted by a skill, even under the user's login. Its label, not the signature, says what it is ("Comment labels"):

- **An ask label** (`Question:`, `Suggestion:`, `Issue:`, `Test:`) → the user's own ask, as if they'd typed it (e.g. `cops:pr-review` run on their own PR).
- **`Note:` / `Drive-by:`** → an explanation ("Author notes").
- **No label** → a skill's reply: never the user's go-ahead, a new ask, or a stated preference. A thread whose last comment is one is already handled.

Used by: `cops:pr-review`, `cops:pr-note`, `cops:pr-address`,
`oss:issue-analyze`, `oss:issue-create`, `oss:issue-verify` (writing);
`cops:pr-address` (Step 3), `pr-oracle` (`triage-threads`) (reading).

## Commit trailers: `Skill:` / `Approved-by:`

The commit-side twin of "Skill signature". A commit a skill makes as a marker other skills search for carries git trailers in the message's final paragraph:

```
fix: <short description> (#123)

Skill: oss:issue-fix
Approved-by: <login>
```

- **`Skill: <plugin>:<skill>`** — always.
- **`Approved-by: <login>`** — the user's GitHub login (`gh api user --jq .login`, or `get_me`), only when the user OK'd the change this commit makes (as "Skill signature" → "Approved"). A commit the skill makes without asking leaves it out.
- **One trailer block.** Host-added trailers (`Co-Authored-By:`, `Claude-Session:`) join the same final paragraph, after these; no blank line between them. Never rely on any trailer being the message's last line.
- **Finding one** — an anchored grep, so a commit that only mentions the skill doesn't match:

  ```bash
  git log --oneline --grep='^Skill: oss:issue-verify$' HEAD
  ```

Used by: `oss:issue-verify` (writes `oss:issue-verify`, finds it),
`oss:issue-fix` (finds `oss:issue-verify`, writes `oss:issue-fix`).

## Author notes: `Note:` / `Drive-by:`

The PR author's own inline comments that explain a change rather than ask for one. `cops:pr-note` posts them on the first implementation:

- **`Note:`** — why the change made a choice the task didn't specify.
- **`Drive-by:`** — why a change the task doesn't need is in the PR.

A thread whose opening comment starts with either label (in either form — "Comment labels"), written by the PR's author, is an explanation, not an ask:

- **Nobody else has commented** → already handled. Don't implement it, don't answer it.
- **Someone else replied** → classify from the last comment, as any other thread.
- **It answers questions about its lines.** A review doesn't raise a `Question:` on a change one of these already explains. A critical change is still an `Issue:` ("Critical changes").

A comment meant as an ask never opens with either prefix.

`cops:pr-note` posts without a draft to confirm: the notes are the author's own reasoning on the author's own PR.

Used by: `cops:pr-note` (posts them), `cops:pr-address` (Step 3, skipping
them), `cops:pr-review` (Steps 2 and 4).

## Critical changes

A critical or dangerous change is worth a review comment even when the path you checked still works. Examples: a breaking change, or a hacky implementation that may have user impact.

Raise it as an `Issue:` and suggest adding a `// FIXME` that names what's wrong. An author's note can answer a `Question:` ("Author notes"). It does not retire this.

Used by: `cops:pr-review`.

## Suggesting next steps

A skill never runs another skill to finish up; whether to pay for it is the user's call. Instead, its final report suggests it in one line each, before the handoffs list, and only on the user's own PR — authored by their GitHub login (`gh api user --jq .login`, or `get_me`).

| Suggest | When | Line |
|---|---|---|
| `/cops:pr-sync` (`/pr-sync` on Cursor) | The skill pushed to an existing PR, leaving its title and description behind. A PR the skill just opened is already current. | The PR's title and description may now be stale; `/cops:pr-sync` will update them. |
| `/cops:pr-note` (`/pr-note` on Cursor) | The PR's review threads (the review-threads row in "GitHub access") hold no comment from anyone else and no `Note:` or `Drive-by:` from the user (either form — "Comment labels") — still the first implementation, not noted yet ("Author notes"). | `/cops:pr-note` will post the reasoning behind the PR's choices, and any drive-by change, as inline comments for reviewers. |

The `cops` plugin isn't installed ("Companion plugin: `cops`") → instead of `pr-sync`, say the title and description need updating by hand; skip `pr-note`.

Used by: `cops:pr-address` (Step 6, pr-sync), `cops:pr-sync` (Step 7, pr-note),
`oss:issue-fix` (Step 7, both). `oss:issue-verify` pushes only once, to
the PR it opens, so it suggests neither.

## Consulting the `pr-oracle` agent

`cops/agents/pr-oracle.md` remembers the user's recurring review themes and preferences — rules that apply in every repo — and profiles a repo's working setup. Skills consult it at fixed points in the modes `scout-repo`, `triage-threads`, `brief-task`, `sweep-diff`, `grill-description`; each skill names which mode it calls where. A skill needing `scout-repo` and another mode at the same point asks for both in one call: `scout-repo` + `brief-task`, `triage-threads` + `scout-repo`, or `scout-repo` + `sweep-diff`. The same agent file is the Claude Code agent and the Cursor subagent.

**Call it by the name this host has:**

- Claude Code — the `cops:pr-oracle` agent.
- Cursor — delegate to the `pr-oracle` subagent and wait for it. It starts blank, so the delegation prompt carries the mode and every input that mode lists. Its reply is the mode's output; continue the skill from there.

These rules hold everywhere:

- **Optional only when it's missing.** The agent isn't available (the `cops` plugin isn't installed — "Companion plugin: `cops`") → do that step inline exactly as the skill describes, and carry on; never stop, and don't treat Cursor itself as missing. "Not available" means the agent doesn't exist in this session, never that the change looks too small to need it. When it exists, call it at every point the skill names: `sweep-diff` and `brief-task` are the only checks against the user's remembered rules, and nothing inline replaces them.
- **Advice, not authority.** A brief or check informs the step; the user's current ask and the skill's own rules still win. The one exception is a *Default* section, where a remembered rule overrides this file ("Defaults and contracts"). A remembered rule conflicts with the current ask → surface the conflict to the user instead of silently picking one.
- **The skill acts, the agent doesn't.** Pushing, replying on threads, and editing the PR stay with the calling skill. Output includes `promote:` → mention it to the user once: a rule that only holds in this repo belongs in the repo's `CLAUDE.md`; the oracle doesn't remember it. A `conflict:` line means a `record-team:` rule contradicts an existing one and wasn't recorded — show both to the user.
- **Pass what you already have.** Every oracle call passes `login: <github-login>` when the skill has already looked it up, so the oracle doesn't repeat the lookup. The oracle reads GitHub only through the GitHub MCP tools, never `gh`, so don't name a route or hand it `gh` commands.
- **Team memory.** Only when the user explicitly asked to remember something for the team, add `record-team: <one line>` to the delegation prompt. The oracle appends it only to `memory/team/MEMORY.md` in the memory repo.

Used by: `cops:pr-address` (triage-threads + scout-repo, sweep-diff),
`cops:pr-sync` (scout-repo, brief-task, grill-description), `cops:pr-review`
(scout-repo + sweep-diff), `cops:pr-note` (scout-repo + brief-task),
`oss:issue-analyze` (scout-repo),
`oss:issue-create` (scout-repo), `oss:issue-verify` (scout-repo),
`oss:issue-fix` (scout-repo, brief-task, sweep-diff).

## GitHub access: `gh`, or the GitHub MCP tools

Skills write their GitHub steps as `gh` commands. Not every host has `gh`: a Claude Code on the web session has no `gh` but has the GitHub MCP server (`mcp__github__*` tools).

- **Pick the route once.** At the first GitHub step, run `gh auth status`. Succeeds → use `gh` for the rest of the skill. Fails (not installed, not logged in) → use the GitHub MCP tools for the rest of the skill; on a host that loads them on demand, load each with `ToolSearch` before its first call. Neither works → treat it as the step's own "no PR"/"can't reach the repo" failure.
- **Access errors.** On the `gh` route, a read that fails with 401/403/404 (org SSO, missing token scope) → retry that one read with the MCP tool before treating it as a failure.
- **Same effect, same gates.** The MCP call replaces the command one for one: a write still needs whatever confirmation the skill requires before the `gh` command.
- **Owner/repo.** MCP tools take them explicitly. For the current checkout, read them from `git remote get-url origin`. For "the current branch's PR", find it with `list_pull_requests` (`head: <owner>:<branch>`, `state: open`).
- **Subagents.** A delegation prompt that has the subagent run `gh` names the route in use; on the MCP route, it names the MCP tool beside each command.

| `gh` | GitHub MCP |
|---|---|
| `gh api user --jq .login` | `get_me` → `login` |
| `gh pr view [<number>] --json …` | `pull_request_read` method `get` (no number → find the PR first, above) |
| `gh pr create --draft --title … --body-file …` | `create_pull_request` with `draft: true`, `head`, `base` |
| `gh pr edit <number> --title … --body-file …` | `update_pull_request` with `title`, `body` |
| `gh pr diff <number>` | `pull_request_read` method `get_diff` |
| `gh api repos/<o>/<r>/pulls/<n>/reviews --input <file>` (a review with inline comments) | `pull_request_review_write` method `create` (no `event`, pending), `add_comment_to_pending_review` per comment, then method `submit_pending` with `event` |
| review threads (`gh api graphql --paginate` … `reviewThreads`) | `pull_request_read` method `get_review_comments`, following `after` while `pageInfo.hasNextPage`; drop threads with `is_resolved: true`. Comments have no `databaseId`: it's the digits after `#discussion_r` in `html_url`. An outdated comment has no `line`; use `original_line`. |
| `gh api repos/<o>/<r>/pulls/comments/<id> --jq .body` | from one `get_review_comments` pass, the comment whose `html_url` ends in `#discussion_r<id>` — fetch the list once and look up every comment you need in it, never once per comment |
| `gh api repos/<o>/<r>/pulls/<n>/comments/<id>/replies -f body=…` | `add_reply_to_pull_request_comment` with `commentId: <id>`, `pullNumber`, `body` |
| `gh issue view <n> --json …,comments` | `issue_read` method `get`, then method `get_comments` |
| `gh issue list --repo <o>/<r> --search … --state all` | `search_issues` with `owner`, `repo`, `query` |
| `gh issue create --repo <o>/<r> --title … --body-file …` | `issue_write` method `create` |
| `gh issue comment <n> --body-file …` | `add_issue_comment` |
| `gh api repos/<o>/<r>/contents/<path>` (file or directory) | `get_file_contents` (`fields: ["name", "type"]` for a directory) |
| `gh api repos/<o>/<r> --jq .default_branch` | `search_repositories` with query `repo:<o>/<r>` → `default_branch` |

Used by: `cops:pr-address`, `cops:pr-sync`, `cops:pr-review`, `cops:pr-note`, `oss:issue-analyze`,
`oss:issue-create`, `oss:issue-verify`, `oss:issue-fix`. `pr-oracle`
keeps its own copy of the read rows next to its tool allowlist.

## Passing drafted text to `gh`

Never put drafted text — a title, a body, a reply — inside a double-quoted shell argument. Issue and PR text is full of backticked code and `$`, and inside `"..."` the shell runs `` `cmd` `` and expands `$VAR`: the posted text comes out mangled, or a command runs.

- **Multi-line text** (an issue, PR, or comment body) → write it to a file with the file-writing tool, never `echo` or an unquoted heredoc, and pass the file: `--body-file <file>` for `gh issue create|comment` and `gh pr create|edit`; `-F body=@<file>` for `gh api`. Put the file in `$(git rev-parse --git-dir)/` inside a checkout (outside the working tree), else in a `mktemp -d` directory; remove it after the command.
- **One line** (a title, or an unsigned one-line reply — "Skill signature") → single quotes, with any `'` in it written as `'\''`, or read it back from a file: `--title "$(cat <file>)"` (command output isn't expanded again).
- **MCP route** → pass the text as the tool's parameter; no quoting concerns.

Used by: `cops:pr-address` (thread replies), `cops:pr-sync` (title and body),
`cops:pr-review`, `cops:pr-note` (review payload), `oss:issue-analyze`, `oss:issue-create`,
`oss:issue-verify`, `oss:issue-fix` (issue, comment, and PR text).
