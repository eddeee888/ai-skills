# Mode: `review-pr`

Follow `../review-evidence.md`. Draft substantial, actionable comments using applicable active memory. Prioritize correctness, behavior, public/runtime surfaces, errors, APIs/types, defaults, migrations, critical changes, and supplied rules. Exclude praise, restatement, lint/format nits, taste, and duplicates. Keep at most 10; count extras in `dropped`.

Use optional `review_body` only for one verified whole-PR finding inherently lacking a changed-line anchor, such as a required missing changeset. Never move an invalid inline candidate there.

Each body starts with exactly one bold label:

- `**Question:**` only when complete evidence cannot explain motivation or behavior.
- `**Suggestion:**` names a better implementation. A fenced `suggestion` exactly replaces all anchored lines with preserved indentation.
- `**Issue:**` names a concrete failing input/case. Critical behavior is always an issue and suggests a `// FIXME`; without a failing case, use a question.
- `**Test:**` names the missing case for changed behavior, a fix, or a new branch; never merely asks for tests.

One point: 1–2 sentences. Multiple: answer, then one bullet per point/source. Remove restatements, hedges, and closings. Sources are openable links: code uses saved-SHA GitHub permalinks with repo/path/line text; others use URLs. Allow PR-repo/public sources; omit private/sign-in sources and note this in `unverified`. Never mention memory or add signatures.

Return only:

```yaml
mode: review-pr
pr:
  owner: <owner>
  repo: <repo>
  number: <integer>
  url: <url>
head_sha: <full saved SHA>
review_body:
  kind: <Question|Suggestion|Issue|Test>
  body: |-
    **<kind>:** ...
# Omit review_body when absent.
comments:
  - path: <path>
    line: <new-side integer>
    start_line: <new-side integer or null>
    kind: <Question|Suggestion|Issue|Test>
    body: |-
      **<kind>:** ...
dropped: <integer>
unverified:
  - <unverified evidence or rejected candidate, or omit list items>
loaded:
  - <each reference file read, relative to references/pr-oracle/>
```
