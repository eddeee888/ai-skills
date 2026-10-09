# Mode: `scout-repo`

Read `../../../CONVENTIONS.md`, especially “Defaults and contracts” and its index. Read only the indexed `CONVENTIONS-*` sections needed to identify defaults that repository or memory rules override.

Input: the repository as `owner/repo`, and whether it is checked out locally. `oss:issue-create` often targets one that is not.

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
overrides: none | <shared-convention default section> → <what to do instead> (<repo CLAUDE.md | repo CONTRIBUTING | team | you>), …
```

Keep it terse: one short line per field, paths instead of quoted contents, and nothing the caller's shared conventions already cover except differences on `overrides:`. A skill reads this to decide, not to learn the repository.

Build the profile fresh on every call and never write it anywhere. Read files locally, or through `get_file_contents` when the repository is not checked out. Read only what each field needs: root `package.json` and workspace configuration, or marketplace/plugin manifests; `.changeset/config.json` and one or two recent entries; the PR template; the `.github/ISSUE_TEMPLATE/` listing and one bug template, or `.github/ISSUE_TEMPLATE.md`; `CONTRIBUTING.md`; and repository `CLAUDE.md`. Use `none` or `n/a` rather than guessing. Skip `tests` for a repository that is not checked out.

When repository `CLAUDE.md` or `CONTRIBUTING.md` states a fact differently from an inference, the repository file wins.

`overrides:` lists every section marked *Default* in the shared convention set for which repository `CLAUDE.md`, repository `CONTRIBUTING.md`, team memory, or personal memory says to do something different. When several sources differ, name only the strongest in this order: repository `CLAUDE.md`, repository `CONTRIBUTING.md`, team, personal. Follow “Defaults and contracts” in `CONVENTIONS.md`. Never list a contract section.
