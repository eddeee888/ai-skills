# Mode: `sweep-diff`

Input: the repository, the selected GitHub route, and the diff to check: a range such as `origin/main...HEAD`, the working tree, or `PR #<number>`. For a PR, read the diff through the selected route's PR diff read in `../github-access.md`: `gh pr diff` or `pull_request_read` method `get_diff`.

Flag each place where the diff repeats something a remembered rule says reviewers push back on. Return:

```text
- <path>:<line>  <what's wrong>  — rule: [<key>] <rule> (<evidence>, from you | team)
```

Copy each rule's `<key>` from the prompt's `rule-keys:` list; leave `[<key>] ` out when the prompt has no such list or doesn't list the rule. Never invent a key.

When there are no matches, return exactly `clean`. Flag only matches backed by a remembered rule. General code review is outside this mode.
