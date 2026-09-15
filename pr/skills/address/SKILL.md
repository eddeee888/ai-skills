---
name: address
description: Work through a pull request's unresolved review comment threads and act on the ones the user has already signaled they're ready for. On the user's own PR, a thread only gets auto-actioned once the user themselves has replied last in it — e.g. a reviewer said "we should do this" and the user replied "Ok", or asked "why this approach?" and the user replied "let me check" — the skill then infers what to do from the original reviewer comment's nature: an authoritative instruction/suggestion gets implemented, a why-question gets answered with concise, backed-up reasoning. Any thread still waiting on the user's own reply, any thread on a PR the user doesn't own, and any acknowledged-but-high-risk change are never auto-actioned — the user is asked what to do with all of them in one batch before anything is applied. Never resolves a review thread automatically. Use when asked to "address PR comments", "handle the review feedback", "go through the review threads", "respond to reviewers", or after the user has left short replies like "Ok"/"let's do it"/"let me check" on review comments and wants them followed through on.
---

# Address PR review comments

A reviewer's comment isn't actionable until the user has actually weighed in on it — a "do this" from a teammate isn't the user's decision to implement until the user has said so, even with a one-word "Ok". This skill treats the user's own reply in a thread as that authorization signal, then carries out what was authorized: an authoritative instruction gets implemented, a why-question gets answered with real backing. Everything the user hasn't yet weighed in on — including anything flagged risky even after a go-ahead — gets surfaced to them in one batch, before any action is taken, rather than being guessed at or applied piecemeal.

## Step 1: Identify the PR and whether it's the user's

```bash
gh pr view --json number,url,author,headRefName,baseRefName 2>&1
gh api user --jq .login
```

Use the current branch's PR unless the user gave a specific PR number/URL. If no PR is found, stop — see "When to stop" below.

Compare the PR's `author.login` to the authenticated user's login. This result gates everything downstream: only on the user's own PR can any thread ever be auto-actioned. On someone else's PR, every thread goes through Step 4 — none are eligible for Step 3's automatic bucket.

## Step 2: Fetch review threads

Pull review threads (not flat issue-level comments — those don't have reply-chain semantics, so they're out of scope here) via GraphQL so resolution state and comment order are available:

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 50) {
              nodes { databaseId author { login } body path line diffHunk }
            }
          }
        }
      }
    }
  }' -f owner=<owner> -f repo=<repo> -F pr=<number>
```

Drop any thread where `isResolved` is true. Keep each thread's ordered comment list — the author and content of the last comment is what Step 3 classifies on.

## Step 3: Classify every unresolved thread into two buckets

For each thread, look at who left the last comment and what it says:

- **Ready to act automatically** — the last comment is the user's own, reads like a short go-ahead/acknowledgment (not already a full answer or the actual content itself — e.g. "Ok", "let's do it", "let me check", not a paragraph that already answers the question), *and* the original reviewer comment it's acknowledging is not critical/high risk (risk framing lives in Step 5a). Tag it with the nature of the *original reviewer comment*, not the reply:
  - **Authoritative** — an instruction, correction, or a ```suggestion``` code block ("do this", "use X instead", "type it this way").
  - **Why-question** — asks for reasoning or justification ("why this approach?", "why not X?").
- **Needs the user first** — everything else:
  - The PR isn't the user's at all.
  - The PR is the user's, but the last comment is from someone other than the user (no reply yet).
  - The last comment is the user's own, but it's already a complete answer/instruction rather than a short go-ahead — nothing to do here; note it as already-handled and don't ask about it.
  - The user did acknowledge it, but the underlying ask is critical/high risk and needs explicit confirmation before it's touched.

## Step 4: Resolve the "needs the user first" bucket before applying anything

If that bucket is non-empty, summarize each item briefly — file:line, who said what, and for a risky-but-acknowledged item, why it's flagged as risky — and ask the user what they want done with each: implement it, draft a reply for them to send, or leave it alone. Don't apply any automatic action while items are still waiting on the user; settle this bucket first. Whatever the user directs here folds into Step 5 alongside the automatic bucket.

If this bucket is empty, skip straight to Step 5 and apply the automatic bucket without pausing.

## Step 5: Handling comments

Apply every thread now settled — the automatic bucket from Step 3, plus whatever the user just approved in Step 4 — grouped by the nature of the original reviewer comment. This is the extension point for future comment categories: add new lettered sub-steps here (5c, 5d, ...) rather than new top-level steps.

### 5a. Authoritative

Implement the change, including applying a `suggestion` block literally when one is present. Before implementing anything from this sub-step (whether it arrived here via Step 3's automatic bucket or Step 4's user approval), assess risk the same way this project weighs any action: is it hard to reverse, does it touch security/auth, cause data loss, touch production config/infra, break a public API, or otherwise carry a wide blast radius? If genuinely low-risk, implement it, run the affected tests, commit, and push. Reply on the thread summarizing what changed:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -f body="<summary>"
```

Do **not** resolve the thread — that's for the reviewer or the user to do, never automatic.

### 5b. Why-question

Research a concise, accurate answer with real backing — documentation, a blog post, a forum thread, or a link to relevant GitHub code/repos. Before posting, check whether any backing resource is private or otherwise inaccessible to the PR's reviewers (an internal repo, an internal wiki/Slack link, anything a public audience couldn't open). Drop those from the public reply — post only the concise answer plus publicly-accessible resources as a reply on the thread — and instead surface the private resource to the user directly in the session (chat), never into the PR comment. Reply the same way as 5a. Do **not** resolve the thread.

## Step 6: Wrap up

If any implementation changes were pushed, run the `pr:sync` skill afterward so the PR description matches the branch. Report back concisely: how many threads were replied to or implemented, and how many are still open for the reviewer or user to resolve manually.

## When to stop instead of proceeding

- No PR found for the current branch or given argument → stop, say so. This skill doesn't create PRs.
- Can't determine risk confidently → treat it as risky and route it through Step 4 rather than guessing.
- A why-question's only backing is a private/inaccessible resource → still answer in the PR reply from your own understanding where possible, but never paste the private link/resource into the PR; hand it to the user in-session instead.
- The user hasn't replied in a thread yet → never auto-act on it, no matter how clearly authoritative or trivial the reviewer's ask looks.
- Never resolve a review thread automatically — replying is as far as this skill goes; resolution is left to a human.
