# pr-note: Steps 3–5

The caller has already enforced the author-only, open-PR, pre-review gates and supplied the `pr-oracle` brief. Do not call the oracle.

## Draft

Call `pr-reviewer` in `draft-author-notes` mode with:

- owner/repo, PR number and URL;
- the full saved `headRefOid`, login, selected GitHub route, and checkout path/status;
- applicable rules from the oracle brief;
- the user's stated task, or PR title/body/linked issue as task sources;
- every line already covered by the author's `Note:`/`Drive-by:`.

The reviewer reads the complete diff, commits, task evidence, existing comments, and repository context itself. Use only its structured YAML. It must return at most 10 verified new-side comments, `dropped`, `remove-instead`, and `unverified`.

If the named reviewer is unavailable but subagents exist, read `../../agents/pr-reviewer.md` and give that contract and the filled prompt to one general read-only subagent. If no subagent capability exists, run the same reviewer contract inline and mark Handoffs accordingly.

`unverified: ["task source required"]` means ask the user what the PR is for, then rerun with the answer. Never guess or classify the whole diff as drive-bys. No comments and no `remove-instead` means `nothing unexplained`.

The reviewer's semantics are authoritative: `Note:` explains an otherwise unexplained non-obvious in-task choice; `Drive-by:` explains a justified out-of-task change even when PR prose already does; an unjustified drive-by appears only under `remove-instead`. Existing notes, standard choices, generated/lock/snapshot/vendored files, and already-explained in-task choices are skipped. No suggestion blocks or memory references.

## Post

Do not ask for confirmation. These are the author's own notes on their own PR. Reject any comment missing a bold `**Note:**`/`**Drive-by:**` label, exceeding the 10-comment cap, or lacking a verified new-side changed-line anchor.

Sign each accepted comment with `cops:pr-note`, without `Approved:` because the user did not see the draft (`CONVENTIONS-posts.md` → "Skill signature"). Keep the top-level body empty. Follow [post-review.md](../pr-review/post-review.md), using `pr-note.json` on the `gh` route, to post exactly one `COMMENT` review. If no accepted comments remain, post nothing.

Return the review link; each posted path/range, kind, and body; `dropped`; rejected/not-posted anchors; `remove-instead`; and `unverified`. Report `pending review left: <what failed>` exactly when applicable. Never post a second review for the same notes.
