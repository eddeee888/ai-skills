# pr-address: Step 3 classification rules

These rules are the source of truth for Step 3. The main skill passes this entire file verbatim to `pr-oracle` in `triage-threads` mode. When the oracle is unavailable, the main chat applies the same rules inline after reading `fetch-threads.md`.

Classify every unresolved review thread into `automatic`, `needs the user first`, or `handled`. For an automatic thread, also tag its nature as `authoritative` or `why-question`.

## Risk gate

High risk means hard to reverse, security/auth, data loss, production config or infrastructure, a public API, or a wide blast radius. Judge risk from the comment text and file path only; do not open code. If uncertain, treat it as high risk.

High-risk work is never automatic. Even when the user acknowledged the thread, put it in `needs the user first` with the reason it was flagged.

## Ownership and last-comment rules

- The PR is not the user's → `needs the user first`, regardless of comment author or content.
- Only the PR's author has commented, and the opening comment starts with `Note:` or `Drive-by:` in bold or plain form → `handled`: it is an explanation, not an ask (`CONVENTIONS-posts.md` → "Comment labels" and "Author notes"). If anyone else replied, classify from the last comment instead.
- Only the user has commented on their own PR → the comment is both ask and go-ahead. If low risk, it is `automatic`; if high risk, `needs the user first`. If there are several user comments, later comments are normally replies already posted by this skill, so mark the thread `handled`; the exception is when the last comment is clearly a new ask, which becomes the current ask.
- The last comment has a valid skill signature and no label → `handled`, even though it appears under the user's login. It is the skill's own reply, never a go-ahead or new ask (`CONVENTIONS-posts.md` → "Skill signature").
- A signed last comment with an ask label (`Question:`, `Suggestion:`, `Issue:`, or `Test:`, bold or plain) is the user's own ask. Apply the same rule as any other user comment.
- A reviewer commented → `automatic` only when the last comment is the user's short go-ahead and the ask is low risk. Examples include “Ok”, “let's do it”, and “let me check”. A paragraph that already answers the reviewer is not a short go-ahead.
- The user's full answer or instruction as the last comment means the thread is `handled`; note it and do not ask again.
- Any other last comment from someone other than the user, including a reviewer ask with no user reply, → `needs the user first`.
- If fetched history hides middle comments and the bucket could change based on who wrote them, → `needs the user first`.

## Nature of automatic work

Tag by the original comment's nature, not by the later go-ahead:

- `authoritative` — an instruction, correction, or fenced `suggestion` block, such as “add a null check” or “use X instead”.
- `why-question` — asks for reasoning or research, such as “why this approach?” or “should this handle X too?”.
- A question plus an instruction that depends on the answer is a `why-question`. Answer it first; the dependent instruction waits for a new user go-ahead on that answer.

## Required output per thread

Return the thread identifier, opening comment `databaseId`, path and effective line, bucket, nature when automatic, one-line ask or handled reason, risk reason when applicable, and every remembered rule the thread matches. Preserve enough author and last-comment information for Step 4's user summary.
