# pr-start: open the PR and report

Read this at Step 6. It holds Step 6's push, title and body, and Step 7's report.

## 6. Push and open the PR

```bash
git push -u origin <branch>
d=<absolute dir>
gh api -X POST repos/<owner>/<repo>/pulls -F draft=true -f base=<default branch> -f head=<branch> -f title="$(cat "$d/pr-start-title.txt")" -F body=@"$d/pr-start-body.md"
rm "$d/pr-start-title.txt" "$d/pr-start-body.md"
```

MCP route: `create_pull_request` with `draft: true` and the two files' contents. Autopilot adds its label and banner (autopilot.md).

- **Title:** conventional prefix matching the branch type, imperative, net effect. Monorepo → `[package-name]` prefix (`CONVENTIONS-pr-metadata.md` → "Monorepo title prefix"). An issue in this repo → end with `(#123)` (`CONVENTIONS-pr-metadata.md` → "Trailing issue reference").
- **Body:** fit the profile's template headers; otherwise the shared format (`CONVENTIONS-pr-metadata.md` → "PR body format"). Why carries the card's Why. Verification: Done when check and result (`CONVENTIONS-verification.md` → "Verification checklist"); scenarios → `### Before` then `### After` under it (`CONVENTIONS-verification.md` → "Before and After"), After `pending: run /cops:pr-wrap-up` each; evidence never holds the PR. Resources names the task source: an issue non-closing, `Relates to #123` or `Relates to owner/repo#123` (`CONVENTIONS-pr-metadata.md` → "Non-closing issue references"); a spec file or chat ask as a line. Write them to `d`, chosen first, per `CONVENTIONS-github.md` → "Passing drafted text to `gh`".

## 7. Wrap up

Report the PR link, commits, Done when result and a raised Size. Show `memory-candidate:` lines, asking whether to save them; only an explicit "remember this" permits `learn-feedback`. Autopilot → before reporting, run autopilot.md's chain, finish and stops (suggest nothing). Otherwise run no other skill; suggest `/cops:pr-wrap-up` when the card lists scenarios, to capture the after, then `/cops:pr-review`, then `/cops:pr-note`, per `CONVENTIONS-orchestration.md` → "Suggesting next steps". End with `CONVENTIONS-orchestration.md` → "Handoffs in the final report", labels `scout-repo + brief-task`, `fix loop` (a second for a sweep follow-up), `sweep-diff` (a second for the follow-up's commit), and `learn-feedback` when run.
