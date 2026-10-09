# Mode: `sweep-diff`

Input: the repository and diff to check: a range such as `origin/main...HEAD`, the working tree, or `PR #<number>`. For a PR, read the diff with `pull_request_read` method `get_diff`.

Flag each place where the diff repeats something a remembered rule says reviewers push back on. Return:

```text
- <path>:<line>  <what's wrong>  — rule: <rule> (<evidence>, from you | team)
```

When there are no matches, return exactly `clean`. Flag only matches backed by a remembered rule. General code review is outside this mode.
