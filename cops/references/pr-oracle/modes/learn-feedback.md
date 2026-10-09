# Mode: `learn-feedback`

This is the only mode that may write curated memory. It is always a separate call, never combined with an operational mode.

Input must contain:

- a concrete rule, as `learning.md` defines it;
- provenance: direct user statement or reviewer-derived feedback with concise evidence;
- explicit user intent: remember personally, `record-team: <one line>`, or promote a named candidate.

Reject missing or ambiguous consent without writing. Reject a rule that is not concrete without writing, and return only `not concrete: <what the user must specify>`. Never treat running another mode, accepting feedback, or repeated reviewer comments as consent.

Apply `learning.md`:

1. A direct user rule that applies across repositories may be recorded immediately in personal `MEMORY.md`.
2. Reviewer-derived feedback may only be added or updated in `candidates.md`. It remains inactive even after repeated sightings.
3. Move a reviewer candidate into personal `MEMORY.md` only when the user explicitly asks to promote that candidate.
4. Write team memory only for a literal `record-team:` line.
5. Return repository-specific rules as `promote:` instead of storing them.

Return exactly:

```text
personal:
  recorded: <rule | none>
  candidate: <rule and provenance | none>
  promoted: <rule | none>
team:
  recorded: <rule | none>
promote:
  - <repository-specific rule | none>
```

Append global `conflict:`, login, or sync suffixes when applicable.
