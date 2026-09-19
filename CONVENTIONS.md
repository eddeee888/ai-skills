# Shared conventions

Formatting/process rules used by more than one skill in this marketplace.
Skills point here instead of restating a rule — change it once, and every
skill that points to it picks it up.

This file sits at the repo root, alongside both plugins, so it's present on
disk regardless of which individual plugin(s) a user installs.

## Monorepo title prefix: `[package-name]`

In a monorepo, lead a PR title with `[package-name]`, naming the package
the change is rooted in — e.g. `[package-name] fix: ...`. A change spanning
several packages leads with whichever carries the primary/root-cause
change, not a list of all of them. This applies to PR titles only — issue
titles aren't package-prefixed.

Used by: `pr:pr-sync` (title), `oss:issue-verify` (checkpoint PR title),
`oss:issue-fix` (fix PR title).

## Trailing issue reference in the PR title: `(#123)`

A PR title that references its issue puts the reference at the end, in
parens — `fix: <description> (#123)` — never mid-title. A resync keeps an
existing trailing reference rather than dropping it.

Used by: `oss:issue-verify`, `oss:issue-fix` (titles), `pr:pr-sync`
(preserving it on resync).

## Non-closing issue references: `Relates to #123` / `Refs #123`

A PR that doesn't fully resolve its issue on merge — a checkpoint PR, or a
fix PR still under review — references it with a non-closing keyword
(`Relates to #123` / `Refs #123`), never `Fixes`/`Closes`, so the issue
stays open until a maintainer closes it deliberately.

A resync preserves whichever keyword is already there; never normalize
`Relates to`/`Refs` up to `Fixes`/`Closes` (or the reverse) — whether the
PR should close the issue on merge isn't a resync's call to make.

Used by: `oss:issue-verify`, `oss:issue-fix`, `pr:pr-sync` (Resources —
preserving the existing keyword).

## Checkpoint/fix branch naming: `repro/<issue-number>` / `fix/<issue-number>`

A checkpoint (failing-test) branch is `repro/<issue-number>`; a fix branch
built on top of it, when it needs one of its own, is `fix/<issue-number>` —
paired names so it's obvious at a glance which fix answers which checkpoint.

Used by: `oss:issue-verify` (checkpoint branch), `oss:issue-fix` (fix
branch).

## Bold the critical claim in Why/What/Verification bullets

Within a bullet, bold (`**...**`) the one fact that matters — the causal
reason, the chosen rationale, a caveat — not the whole sentence. E.g. "This
fails because **component A fails to request component B**" or "Found
issue D. **Not fixed in this PR.**" Skip bullets with nothing critical
enough to call out.

Used by: `pr:pr-sync` (Why/What/Verification).

## Verification checklist: name the test type, not the command

When a check already ran the same way in CI, name the kind of test rather
than the literal command — `- [x] Unit tests`, not `- [x] Ran \`pnpm
test\``. Reserve the literal command for something run manually, outside
what CI already covers.

Used by: `pr:pr-sync` (Verification).

## Don't checklist an intentionally-failing check as done

When a branch's own tests are failing on purpose — a checkpoint commit with
no fix yet, not a broken build — say so plainly instead of checking it off:
`- [ ] Unit tests — intentionally failing, reproduces the bug`, never
`- [x]`. A checked box reads as "this works"; a checkpoint's whole point is
that it doesn't, yet.

Used by: `pr:pr-sync` (Verification), regardless of which skill produced
the branch.
