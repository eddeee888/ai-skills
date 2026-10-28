# Mode: `sweep-diff`

Input: the repository, the selected GitHub route, and the diff to check: a range such as `origin/main...HEAD`, the working tree, or `PR #<number>`. For a PR, read the diff through the PR diff read in `../github-access.md`.

Check every active rule (`../picking.md`) against the diff, minus caller-only ones. A Markdown-only diff can't break a rule with `applies-to: **/*.ts`. No active rules → return `clean`.

Flag each place where the diff breaks a rule. Return:

```text
- <path>:<line>  <what's wrong>  — rule: [<id>] <rule> (<evidence>, from you | team)
```

When there are no matches, return exactly `clean`. Flag only matches backed by a remembered rule. General code review is outside this mode.
