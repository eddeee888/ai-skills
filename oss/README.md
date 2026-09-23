# oss

Claude Code plugin — skills for maintaining and contributing to open source
projects: issue triage, release notes, changelog management, contribution
guidelines, and similar.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/oss:<skill-name>` once this plugin is installed, e.g. `/oss:issue-verify`.

Add each skill as its own directory here, e.g. `skills/<skill-name>/SKILL.md`.

`issue-fix` consults the `pr` plugin's `pr-sidekick` agent, when installed,
for remembered review rules around the fix — install `pr` too to get that;
without it, `issue-fix` works the same, just without the memory.
