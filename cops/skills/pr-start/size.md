# pr-start: task size

Read this at Step 3, while drafting the task card and before showing it.

## The line

The card carries one line, `Size: <Small|Medium|Large> — <reason>`, sized by `CONVENTIONS-pr-metadata.md` → "Task size". Write the name in full and give one or two concrete reasons taken from the card, such as `Size: Medium — touches the shared retry helper and two packages`.

The size is advisory, shown for the user to see. It gates nothing: the steps, the handoff, the model choice and what the run may do are the same at every size, and autopilot is still offered at Large, with an advisory note ([autopilot.md](autopilot.md)).

## Derive it from what the card already holds

Use only what the card already says — Goal, Done when, In scope and Approach — and the profile from Step 2. Make no extra survey, read no code for it, and make no extra oracle call.

- **Blast radius** — count what In scope names against the profile's package map: one place as that section defines it, or several files, packages or a shared helper.
- **Contract** — whether the Goal, Approach or Done when names a change to an existing public API, exported type, CLI flag, config shape or documented behavior.
- **Design decision** — an Approach that still rests on a decision nobody has made is Large.
- **Also Large** — the Goal or Approach reaches most consumers, rests on a core assumption spanning packages, or names an RFC, deprecation window, migration guide or proactive announcement.
- **Options** — when the card shows options instead of one Approach, size each one from its own Changes, Affects and Risk and write it on that option's `Size:` line, so every size is seen before the user picks. The card's `Size:` line reads `Size: per option, below` until then, and takes the picked option's size once one is picked.
- **Can't tell** between two sizes from the card → take the larger and name what is unknown as the reason.

## An issue that is already sized

When the task is an issue whose thread, already read as a task source, carries a comment signed by the `issue-analyze` skill that states a size, start from that size. With several such comments, use the newest.

Only ever raise it: the card's scope or Approach reaching further than the analysis did moves the size up, and nothing on the card moves it down. Name the starting point in the reason, such as `Size: Large — sized Medium in the issue analysis; the Approach also changes the documented config shape`.

## When the card changes

An edit to scope or Approach → derive the size again before showing the card again. The user's own edit to the `Size:` line stands.

After the card is confirmed, the size can still go up if the fix loop finds the change reaches further than the card said; fix-loop.md says how and where that is reported.

## Options on the card

Only when the direction is unclear or the user asks, the card shows options instead of one Approach. Give 2–3, each as:

```text
Option <A>: <one-line name>
  Changes: <files or packages and what changes in each>
  Affects: <who or what else sees the change>
  Risk: <what could break, and how likely>
  Effort: <rough size — a few lines | one file | several files>
  Size: <Small|Medium|Large> — <reason>
```

The card's Approach and Size become the picked option's.
