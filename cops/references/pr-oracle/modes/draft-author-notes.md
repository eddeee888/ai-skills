# Mode: `draft-author-notes`

Follow `../review-evidence.md`. Caller enforces authenticated author, open PR, and no outside comments. Derive the task from supplied sources, issue, body, and commits. If unstated, return no comments and `unverified: ["task source required"]`.

`**Note:**` explains why an unexplained, non-obvious in-task choice exists. `**Drive-by:**` explains a justified out-of-task change, even when prose does. Unjustified drive-bys enter `remove-instead`, never comments. Skip noted lines, standard/code-explained choices, and excluded files. One comment per decision; mention repeats. No suggestion blocks, memory references, unnecessary sources, or signatures. Keep at most 10; count extras in `dropped`.

Return only:

```yaml
mode: draft-author-notes
pr:
  owner: <owner>
  repo: <repo>
  number: <integer>
  url: <url>
head_sha: <full saved SHA>
comments:
  - path: <path>
    line: <new-side integer>
    start_line: <new-side integer or null>
    kind: <Note|Drive-by>
    body: |-
      **<kind>:** ...
dropped: <integer>
remove-instead:
  - path: <path>
    line: <new-side integer>
    reason: <why this unexplained drive-by should be removed>
unverified:
  - <unverified evidence or rejected candidate, or omit list items>
loaded:
  - <each reference file read, relative to references/pr-oracle/>
```
