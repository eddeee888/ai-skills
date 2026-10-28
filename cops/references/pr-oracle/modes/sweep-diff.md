# Mode: `sweep-diff`

Input: the repository, the selected GitHub route, and the diff to check: a range such as `origin/main...HEAD`, the working tree, or `PR #<number>`. For a PR, read the diff through the PR diff read in `../github-access.md`.

Check the candidate rules (`../picking.md`) for the diff's changed paths, minus caller-only ones. A Markdown-only diff skips a rule with `applies-to: **/*.ts`. No candidates → return `clean`.

Flag each place where the diff breaks a candidate rule. Return:

```text
- <path>:<line>  <what's wrong>  — rule: [<id>] <rule> (<evidence>, from you | team)
```

When there are no matches, return exactly `clean`. Flag only matches backed by a remembered rule. General code review is outside this mode.
