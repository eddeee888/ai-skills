# pr-start: resume autopilot

Read this, instead of SKILL.md Steps 1–3, when the user asks to resume a stopped autopilot run ([autopilot.md](autopilot.md) → "Stops").

## The trigger is the consent

Only the user's own words in their own message start a resume, such as "resume the rest with autopilot" or "continue autopilot", or the typed `/cops:pr-start --autopilot resume [<PR URL>]`. An agent, subagent, skill or inferred request never supplies it, as with the flag.

Asked in words, call pr-start with args `--autopilot resume [<PR URL>]`: the pane reads a resume from those args, and the user's message is the consent, not the call's author. A plain `--autopilot` the model passes stays ignored.

That message is the consent: show no card. Print the `Autopilot authorises: …` line from autopilot.md → "At the card", then run. The login is the confirmed card's, else found as autopilot.md → "Flag and login" says; none → ask for it before running.

## In the same conversation

The card confirmed earlier in this conversation stands. Continue from the step the stop report named:

- the fix loop → spawn the sidekick again with the user's answer as `Resuming:`; a stop at the 3-attempt bound has no answer, so it gets a fresh 3 attempts, and what failed from the stop report as `Resuming:`;
- the sweep, or pushing and opening the PR → that step of SKILL.md;
- a chain stage → that stage, then the rest of autopilot.md → "The chain".

## In a new conversation

Without the card, only the chain resumes. Pick the PR the user names, else the current branch's, and check it is open, opened on autopilot (its body opens with a `> [!NOTE]` block starting `Opened on autopilot by`, or it has the `autopilot` label), and authored by the authenticated login. Another PR → stop and say why.

The run stopped before a PR existed → say the card is gone and point to starting `/cops:pr-start` again.

Read the PR's reviews and comments, then run autopilot.md → "The chain" in order, with these differences:

- `cops:pr-review` is skipped when a review signed `cops:pr-review` exists.
- `cops:pr-address` and `cops:pr-wrap-up` always run; each finishes itself when nothing is left. `cops:pr-address` is still skipped when this run's `cops:pr-review` reports no findings.
- With `cops:pr-review` skipped, existing threads signed `cops:pr-review` count as this run's self-review threads for autopilot.md → "Address rules" and `../pr-address/classify.md` → "Autopilot runs".
- `cops:pr-note` is skipped when a review or comment signed `cops:pr-note` exists.
- A post signed `cops:pr-note` means address and wrap-up finished: run only Finish, so a rebase from `cops:pr-wrap-up` never lands after the notes.
- `cops:pr-wrap-up` and `cops:pr-note` get the PR body's Why as motivation and task source. `cops:pr-address`, when it runs, calls its own `scout-repo`; `cops:pr-wrap-up` then gets that profile as `autopilot profile:` (autopilot.md → "The chain"), else runs its own.

Report each skipped stage and why.

## Either way

- A resume never opens a second PR and never runs the fix loop on a PR that already exists.
- Finish, Stops and Handoffs follow autopilot.md; a stop ends with the same resume line.
