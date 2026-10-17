# pr-start: evidence rules

Read this only when the card's Evidence lists scenarios. Statuses and kinds: `CONVENTIONS-evidence.md`.

## Where captures run

`api` and `cli` captures run only against a local or ephemeral environment the repo's own scripts start, with no real credentials loaded. A scenario that needs credentials or a shared environment becomes `manual`.

## Text evidence

`api` / `cli` output, an `architecture` Mermaid before/after labelled `drawn`, and a labelled `mock` go inline in the PR body under `### Before` / `### After`, each in a fenced block under its scenario name, status and SHA.

## `manual` block

```text
manual: <scenario>
Needs: <what must be running or set up>
Expect: <what the output should show>
  <command>
```

- Commands come only from the repo's own tooling; `Needs:` and `Expect:` are required lines. Nothing invented: no tooling → say what is missing.
- The agent never runs it and never deploys to a shared environment.
- Output the user pastes back becomes `captured-by-user`.

## Screenshots

A screenshot is captured to scratch. The body says `pending: drop <name>.png here`; the user drags it into the PR body, GitHub hosts it, and the status is `captured-by-user`.

## Manifest

The main chat writes the manifest at Step 5b from the capture handoffs' lines, as a collapsed `<details>` block in the PR body. It is the source of truth, so a later session works with no branch.

## Secret backstop

Before captured `api` and `cli` text goes into the body, scan it for `Authorization`, `Bearer`, `Set-Cookie` and `api[_-]key` headers, token-shaped values and private-key blocks. A hit lists `path:line`, nothing is posted, and the scenario becomes `not-captured — possible secret`. It is a backstop, not a guarantee.
