# Mode: `triage-threads`

Read `../../../CONVENTIONS-posts.md` sections “Comment labels,” “Skill signature,” and “Author notes.” The signature-reading rule is a contract even when a writing default is overridden.

Input: the PR's owner/repository/number, the user's login, whether the PR is the user's own, and the full classification rules from `cops/skills/pr-address/classify.md`. Apply those supplied rules exactly; they are the source of truth, not this agent.

1. Fetch review threads with `pull_request_read` method `get_review_comments`. Pass `after: <endCursor>` while `pageInfo.hasNextPage` is true. Drop threads whose `is_resolved` is `true`. Comments have no `databaseId`; extract it from the digits after `#discussion_r` in each comment's `html_url`. An outdated comment has no `line`, so use `original_line`.
2. Classify every unresolved thread under the supplied rules. Determine the bucket from its last comment and the nature from its opening comment. A comment ending in a skill signature—a `<sub>` line reading `Skill: <plugin>:<skill>`, linked into `github.com/eddeee888/ai-skills`, before any host footer—was posted by a skill under the user's login. With an ask label it is the user's own ask. With no label it is a skill reply, never a go-ahead and never something to learn from. If an ask matches remembered memory, note that as caller context without changing its bucket.
3. Never write memory. For concrete reviewer-derived feedback that could apply across repositories, append `memory-candidate: <rule/evidence>` after the structured result so the caller can request consent. Do not emit a candidate from a skill reply.

Return exactly:

```text
automatic:
  - thread: <id>  comment: <databaseId>  at: <path>:<line>
    nature: authoritative | why-question
    ask: <one line>
    remembered: <matching rule (you | team), or "none">
needs-user:
  - thread: <id>  comment: <databaseId>  at: <path>:<line>
    reason: <not your PR | awaiting user reply | risky: why>
    ask: <one line>
    remembered: <matching rule (you | team), or "none">
already-handled:
  - thread: <id>  at: <path>:<line>  note: <one line>
edit-rules:
  - <rule>  (<evidence>, from you | team)
```

`edit-rules:` lists every active rule on how code, tests, or commits are written. The caller pastes it into editing handoffs, which have no other source of memory. Leave out rules only the caller can act on (consulting the oracle, asking the user, when to push or squash). None → `edit-rules: none`.

