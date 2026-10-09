# pr-address: Step 5b why-question research

Read this file only after Step 4 has settled every user decision and immediately before researching or drafting an answer to a why-question.

Research an accurate answer with real backing: documentation, a blog post, a forum thread, or relevant GitHub code or repositories. Every posted source must be linked and accessible to the PR's reviewers exactly as `CONVENTIONS-posts.md` → "Citing sources" requires. Code links must be commit-pinned permalinks.

Answer in the main chat only when the required evidence is already in the conversation. Any answer requiring a web fetch or reading code goes to one read-only research subagent (`CONVENTIONS-orchestration.md` → "Hand long loops to a subagent"). Give it only the question, path and line, plus this instruction:

```text
Research this. Return a one-sentence answer, then one point per bullet,
each ending with its public source as a link; use a commit-pinned permalink
for code. List private sources separately. Do not post on the PR.
```

The handoff may cover multiple settled why-questions, but its result must distinguish them. The main chat checks the sources and posts; the research subagent never writes to GitHub.

Format each reply under `CONVENTIONS-posts.md` → "Comment body": one point can be one or two sentences; more than one point or source starts with the answer and then uses one bullet per point, with its source at that bullet's end. Cut restatements and unsupported claims.

If the only backing is private, post only what public sources support or say plainly that the backing is private. Give private sources to the user in-session, never in the PR reply.

Sign the final reply with `cops:pr-address` but omit `Approved: <login>` (`CONVENTIONS-posts.md` → "Skill signature"): the user's go-ahead authorized answering, but they did not see this answer's text. Write the signed body to a file and pass it with `-F body=@<file>` as `CONVENTIONS-github.md` → "Passing drafted text to `gh`" requires:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/comments/<databaseId>/replies -F body=@<file>
```

On MCP, use `add_reply_to_pull_request_comment` with `commentId: <databaseId>`, `pullNumber`, and `body`. Never resolve the thread.
