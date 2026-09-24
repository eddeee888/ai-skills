# oss

Claude Code plugin — skills for maintaining and contributing to open source
projects: issue triage, release notes, changelog management, contribution
guidelines, and similar.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/oss:<skill-name>` once this plugin is installed, e.g. `/oss:issue-verify`.

Add each skill as its own directory here, e.g. `skills/<skill-name>/SKILL.md`.

`issue-create`, `issue-verify`, and `issue-fix` consult the `pr` plugin's `pr-sidekick` agent, when installed, for a cached profile of the repo (templates, test layout, monorepo packages) and, in `issue-fix`, for remembered review rules around the fix. That agent is `pr:pr-sidekick` in Claude Code and the `pr-sidekick` subagent in Cursor — install `pr` too to get it; without it, each skill works the same, just without the memory.
