# Mode: `sweep-diff`

Input: the repository, the selected GitHub route, and the diff to check: a range such as `origin/main...HEAD`, the working tree, or `PR #<number>`. For a PR, read the diff through the PR diff read in `../github-access.md`.

List the diff's changed paths. Apply only rules whose `applies-to:` globs match one of them, plus rules without `applies-to:` (`../memory.md`); skip the rest. A Markdown-only diff skips a rule with `applies-to: **/*.ts`. No rule applies → return `clean`.

Flag each place where the diff repeats something a remembered rule says reviewers push back on. Return:

```text
- <path>:<line>  <what's wrong>  — rule: [<id>] <rule> (<evidence>, from you | team)
```

When there are no matches, return exactly `clean`. Flag only matches backed by a remembered rule. General code review is outside this mode.
