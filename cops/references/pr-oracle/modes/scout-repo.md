# Mode: `scout-repo`

Read `../../../CONVENTIONS.md`, especially “Defaults and contracts” and its index. Read only the indexed `CONVENTIONS-*` sections needed to identify defaults that repository or memory rules override.

Input: the repository as `owner/repo`, whether it is checked out locally, and the selected GitHub route. Callers may target a repository that isn't checked out.

Return the repository's working setup exactly in this shape:

```text
default-branch: <name>
package-manager: <npm | pnpm | yarn | bun | …, or n/a>
monorepo: no | yes — <how packages are declared: workspace tool, or top-level plugin/package directories>; packages: <name> → <path>, …
tests: <runner>; one package: <command>; one file/test: <command>; tests live: <colocated | __tests__/ | test/ | …>
changesets: no | yes — <config path>; bump style: <what existing entries use>
pr-template: none | <path> — headers: <list>
issue-templates: none | <path> — bug template: <file>; required fields: <list>
contributing: none | <path> — <rules that bind a PR or an issue: commit style, sign-off/DCO, required checks, issue etiquette, …>
evidence: none | <kind> → <tool> (<command>), …; deploy → <command>, …   e.g. ui → storybook (pnpm storybook:build); api → openapi (openapi.yaml); deploy → pnpm sst deploy --stage staging
overrides: none | <shared-convention default section> → <what to do instead> (<repo CLAUDE.md | repo CONTRIBUTING | team | you>), …
```

Keep it terse: one short line per field, paths instead of quoted contents, and nothing the caller's shared conventions already cover except differences on `overrides:`. A skill reads this to decide, not to learn the repository.

Given `profile:`, return it unchanged and read nothing for it. Otherwise build it fresh. Never write it anywhere. Read files locally, or through the selected route's file read in `../github-access.md` when the repository is not checked out. Read only what each field needs: root `package.json` and workspace configuration, or marketplace/plugin manifests; `.changeset/config.json` and one or two recent entries; the PR template; the `.github/ISSUE_TEMPLATE/` listing and one bug template, or `.github/ISSUE_TEMPLATE.md`; `CONTRIBUTING.md`; and repository `CLAUDE.md`. Use `none` or `n/a` rather than guessing. Skip `tests` for a repository that is not checked out.

`evidence:` names what the repository already has to show a change before and after, by kind (`ui`, `api`, `cli`, `architecture`), from `package.json` scripts, `.storybook/`, `playwright.config.*`, `bruno/`, `*.insomnia` and `openapi.*`. `deploy →` entries are the repository's own commands for a shared environment, from `package.json` scripts, `Makefile`, IaC config (CDK, SST, Serverless, Terraform) and `workflow_dispatch` workflows; a user runs them, never the agent. List only tooling and commands found, never guessed; `none` when there are none. Never capture anything (`CONVENTIONS-evidence.md` → "Evidence scenarios").

When repository `CLAUDE.md` or `CONTRIBUTING.md` states a fact differently from an inference, the repository file wins.

`overrides:` lists every section marked *Default* in the shared convention set for which repository `CLAUDE.md`, repository `CONTRIBUTING.md`, team memory, or personal memory says to do something different. When several sources differ, name only the strongest in this order: repository `CLAUDE.md`, repository `CONTRIBUTING.md`, team, personal. Follow “Defaults and contracts” in `CONVENTIONS.md`. Never list a contract section.
