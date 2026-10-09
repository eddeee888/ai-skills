# Discover an `issue-verify` checkpoint

Read this file before any checkpoint discovery. A checkpoint is identified by the anchored commit trailer `Skill: oss:issue-verify`, then guarded by the exact issue number. Do not treat a branch name alone as proof.

## Numbered issue

Run the cheap local and remote sentinels first:

```bash
git log --oneline --grep='^Skill: oss:issue-verify$' HEAD | grep -E "#<issue-number>([^0-9]|$)"
git ls-remote --heads origin "repro/<issue-number>"
```

`([^0-9]|$)` is mandatory: it keeps `#12` from matching `#123`. If the local command returns a commit, resolve its containing branch. If the remote branch sentinel returns a ref but no local commit, fetch before inspecting it; the branch is only a candidate until its history contains the anchored trailer and exact issue number.

Both empty, or the remote sentinel has not produced a verified commit → perform one wider sweep:

```bash
git fetch origin --quiet
git log --all --oneline --grep='^Skill: oss:issue-verify$' | grep -E "#<issue-number>([^0-9]|$)"
```

Match found → return the literal sentinel `CHECKPOINT_FOUND` with the checkpoint commit SHA and branch, distinguishing current, local, and remote-only branches. Nothing found → return the literal sentinel `CHECKPOINT_NOT_FOUND`.

## No issue number

Run the same local and all-history `git log` commands without the `grep -E` issue-number guard; skip `git ls-remote`. Return every candidate with commit SHA, subject, and containing branch. More than one → return `CHECKPOINT_AMBIGUOUS` so the caller asks the user which issue. None → `CHECKPOINT_NOT_FOUND`.

## Guards

- The trailer grep remains anchored exactly as `--grep='^Skill: oss:issue-verify$'`.
- A numbered lookup must retain the exact `#<issue-number>([^0-9]|$)` guard.
- Search the current history before fetching and sweeping all refs.
- Never guess a base from `repro/<issue-number>` or from an unverified commit message.
- Return `CHECKPOINT_FOUND` only with a verified commit SHA and branch.
