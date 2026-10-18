# Mode: `sweep-diff`

Input: the repository, the selected GitHub route, and the diff to check: a range such as `origin/main...HEAD`, the working tree, or `PR #<number>`. For a PR, read the diff through the selected route's PR diff read in `../github-access.md`: `gh pr diff` or `pull_request_read` method `get_diff`.

List the diff's changed paths. Apply only rules whose `applies-to:` globs match one of them, plus rules without `applies-to:` (`../memory.md`); skip the rest. A Markdown-only diff skips a rule with `applies-to: **/*.ts`. No rule applies → return `clean`.

Flag each place where the diff repeats something a remembered rule says reviewers push back on. Return:

```text
- <path>:<line>  <what's wrong>  — rule: <rule> (<evidence>, from you | team)
```

When there are no matches, return exactly `clean`. Flag only matches backed by a remembered rule. General code review is outside this mode.
