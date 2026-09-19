# Shared conventions

Formatting/process rules used by more than one skill across the `oss` and `pr`
plugins. Skills reference this file instead of re-stating the rule inline —
if a convention changes, it changes once, here, and every skill that points
to it picks it up.

This file lives at the marketplace repo's root, alongside both plugins'
source directories, so it's present on disk regardless of which individual
plugin(s) a user has installed from this marketplace.

## Monorepo title prefix: `[package-name]`

When naming a PR title (or a checkpoint/test PR title) for a change in a
monorepo (multiple workspaces/packages), lead with a `[package-name]` prefix
naming the package the change is actually rooted in — e.g. `[package-name]
fix: ...`. If the change spans several packages, prefix with whichever
carries the primary/root-cause change rather than listing every package
touched. This makes a PR recognizable in a list without opening it.

Used by: `pr:pr-sync` (Step 5, title), `oss:issue-verify` (Step 5, checkpoint
PR title), `oss:issue-fix` (Step 6, fix PR title).

This applies to PR titles only — issue titles (drafted by `oss:issue-create`
and `oss:feature-analyze`) aren't package-prefixed by this convention.

## Trailing issue reference in the PR title: `(#123)`

When a PR title references the issue it's for, put that reference at the
end, in parens — `fix: <description> (#123)`, `test: reproduce <bug>
(failing) (#123)` — never mid-title. When resyncing a title that already
carries this reference, keep it in the new title, in the same trailing
form; don't let a resync silently drop it.

Used by: `oss:issue-verify` (Step 5, checkpoint PR title), `oss:issue-fix`
(Step 6, fix PR title), `pr:pr-sync` (Step 5, title — preserving it on
resync).

## Non-closing issue references: `Relates to #123` / `Refs #123`

When a PR references an issue but doesn't fully resolve it on merge — a
checkpoint (still-failing-test) PR, or a fix PR still under review — use a
non-closing keyword (`Relates to #123` / `Refs #123`), never `Fixes #123` /
`Closes #123`. This keeps the issue open until a maintainer explicitly
closes it, instead of GitHub auto-closing it as a side effect of merging
one of these PRs.

Whichever keyword is already in use — closing or non-closing — stays as-is
on a resync. Never normalize `Relates to`/`Refs` up to `Fixes`/`Closes` (or
the reverse) as a side effect of rewriting the PR body; whether this PR
should close the issue on merge isn't a resync's call to make.

Used by: `oss:issue-verify` (Step 5), `oss:issue-fix` (Step 6), `pr:pr-sync`
(Step 5, Resources — preserving whichever keyword is already there).

## Checkpoint/fix branch naming: `repro/<issue-number>` / `fix/<issue-number>`

A checkpoint (failing-test) branch is named `repro/<issue-number>`; the fix
branch built on top of it, when it needs a new branch of its own, is named
`fix/<issue-number>`. Naming them as a pair makes it obvious at a glance
which fix branch answers to which checkpoint.

Used by: `oss:issue-verify` (Step 5, checkpoint branch), `oss:issue-fix`
(Step 1, fix branch).

## Bold the critical claim in Why/What/Verification bullets

Within a Why/What/Verification bullet, bold (`**...**`) the specific fact
that matters — the causal reason, the chosen rationale, or a caveat — not
the whole sentence, and not incidental detail around it. Examples:

- "This fails because **component A fails to request component B**"
- "Chose this option because **reason C**"
- "Found issue D. **Not fixed in this PR.**"

A bullet with nothing critical enough to call out doesn't need bolding at
all — this isn't "bold one phrase per bullet no matter what."

Used by: `pr:pr-sync` (Step 5, Why/What/Verification).

## Verification checklist: name the test type, not the command

When a Verification/"how was this tested" bullet reports a check that ran
the same way it already runs in CI, name the kind of test/check rather than
the literal command — `- [x] Unit tests` rather than `- [x] Ran \`pnpm
test\``. Reserve the literal command (or exact steps) for something run
manually, outside what CI already covers — a manual repro, an ad hoc
script, a one-off check.

Used by: `pr:pr-sync` (Step 5, Verification).

## Don't checklist an intentionally-failing check as done

When a branch's own tests are currently failing on purpose — a
reproduction/checkpoint commit that has no fix yet, not a broken build —
say so plainly in the Verification section instead of checklisting it as
passing: `- [ ] Unit tests — intentionally failing, reproduces the bug`,
never `- [x] Unit tests`. A checked box reads as "this works"; a checkpoint
PR's whole point is that it doesn't, yet.

Used by: `pr:pr-sync` (Step 5, Verification — applies whenever the diff's
own tests are failing and that looks intentional, whichever skill produced
the branch).
