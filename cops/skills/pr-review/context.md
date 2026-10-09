# pr-review: Step 4 context check

Read this file only when at least one candidate `Question:` needs evidence outside the PR diff: a caller, a definition, or `git log`/`git blame` for changed lines. Questions already answered by the diff, PR body, commit messages, or an author's `Note:` / `Drive-by:` are dropped before this handoff.

Send every outside-code question together to one read-only `Explore` subagent using model `sonnet`, as required by `CONVENTIONS-orchestration.md` → "Hand long loops to a subagent". Do not open those files in the main chat first.

Use this exact prompt shape:

```text
Repo <owner>/<repo>, PR #<number>, head <headRefOid>.
Checked out: <yes — path | no — read files with get_file_contents at ref <headRefOid>>
For each question, find out whether the code outside the diff already
answers it (a definition, a caller, the history of the changed lines).
1. <path>:<line> — <the question>
2. ...
Return one line per question: answered (the answer, with the file:line
that shows it) | unanswered | problem (what's wrong, file:line).
Don't comment on the PR.
```

Interpret each result mechanically:

- `answered` → drop the candidate.
- `unanswered` → keep it as `Question:`.
- `problem` → convert it to `Suggestion:` or `Issue:` under the main skill's comment semantics. A concrete failing case or critical change is an issue; otherwise use a suggestion.

The subagent must inspect at `headRefOid`. If there is no local checkout, every `get_file_contents` read uses that ref so context cannot drift from the review anchor. It performs no GitHub write.

If no candidate needs outside code, skip this file and handoff. If the host has no subagent capability, perform the same read-only check inline and record the handoff exactly as `CONVENTIONS-orchestration.md` → "Handoffs in the final report" requires.
