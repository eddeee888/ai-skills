# pr-note: drafting and posting

The caller has already enforced the author-only, open-PR, and pre-review gates.

## Draft

Call `pr-oracle` in `draft-author-notes` mode with:

- owner/repo, PR number and URL;
- the full saved `headRefOid`, login, selected GitHub route, and checkout path/status;
- the user's stated task, or PR title/body/linked issue as task sources;
- every line already covered by the author's `Note:`/`Drive-by:`.

The oracle applies active memory and reads the complete diff, commits, task evidence, existing comments, and repository context itself. Use only its structured YAML. It must return at most 10 verified new-side comments, `dropped`, `remove-instead`, and `unverified`.

If the oracle is unavailable but subagents exist, read `../../agents/pr-oracle.md`, its `draft-author-notes` mode and review-evidence references, and give that contract and the filled prompt to one general read-only subagent. If no subagent capability exists, run the same contract inline and mark Handoffs accordingly.

`unverified: ["task source required"]` means ask the user what the PR is for, then rerun with the answer. Never guess or classify the whole diff as drive-bys. No comments and no `remove-instead` means `nothing unexplained`.

The mode's semantics are authoritative: `Note:` explains an otherwise unexplained non-obvious in-task choice; `Drive-by:` explains a justified out-of-task change even when PR prose already does; an unjustified drive-by appears only under `remove-instead`. Existing notes, standard choices, generated/lock/snapshot/vendored files, and already-explained in-task choices are skipped. No suggestion blocks or memory references.

## Post

Run only after the user confirmed the draft in SKILL.md Step 4. Reject any comment missing a bold `**Note:**`/`**Drive-by:**` label, exceeding the 10-comment cap, or lacking a verified new-side changed-line anchor.

Sign each accepted comment with `cops:pr-note` and `Approved: <login>` (`CONVENTIONS-posts.md` → "Skill signature"). Keep the top-level body empty. Follow [post-review.md](../pr-review/post-review.md), using `pr-note.json` on the `gh` route, to post exactly one `COMMENT` review. If no accepted comments remain, post nothing.

Report `pending review left: <what failed>` exactly when applicable. Never post a second review for the same notes.
