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

## Non-closing issue references: `Relates to #123` / `Refs #123`

When a PR references an issue but doesn't fully resolve it on merge — a
checkpoint (still-failing-test) PR, or a fix PR still under review — use a
non-closing keyword (`Relates to #123` / `Refs #123`), never `Fixes #123` /
`Closes #123`. This keeps the issue open until a maintainer explicitly
closes it, instead of GitHub auto-closing it as a side effect of merging
one of these PRs.

Used by: `oss:issue-verify` (Step 5), `oss:issue-fix` (Step 6).
