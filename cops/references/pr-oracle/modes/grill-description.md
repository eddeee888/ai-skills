# Mode: `grill-description`

Read `../../../CONVENTIONS.md` for “Defaults and contracts,” then read the PR-description-relevant sections in `../../../CONVENTIONS-pr-metadata.md` and the “Citing sources” section in `../../../CONVENTIONS-posts.md`.

Input: the PR's owner/repository/number, base ref, and drafted title and body that `cops:pr-sync` is about to apply, either inline or as file paths to read.

1. Read the diff and commit log against the base.
2. Flag:
   - **Unsupported**: a draft claim the diff does not support.
   - **Missing**: a behavior change in the diff the draft does not mention.
   - **Convention**: a break from the shared convention set at the `cops` plugin root. Flag a contract break, or a *Default* break when no repository, team, personal, or prompt-relayed preference overrides it. Following an override is not a break. Examples include checking Verification for a test intentionally failing, normalizing `Relates to` into `Fixes`, or dropping a trailing `(#123)`.
   - **Style**: a break from a remembered description preference or one the prompt relays, including a repository-only preference, which is flagged here but not remembered. A relayed preference matching remembered memory produces one flag, not two.
3. Never write memory. A concrete user-stated preference that could apply across repositories may append `memory-candidate: <rule/evidence>` for the caller to show. A repository-only preference may append `promote: <rule>`.

Return:

```text
- unsupported | missing | convention | style: <what>  — <fix>
```

When there are no flags, return exactly `clean`.
