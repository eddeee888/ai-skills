# oss

Plugin for Claude Code and Cursor — skills for maintaining and contributing
to open source projects: sizing, filing, verifying, and fixing issues.

Skills live under `skills/<skill-name>/SKILL.md` and are invoked as
`/oss:<skill-name>` once this plugin is installed, e.g. `/oss:issue-verify`
(`/issue-verify` in Cursor).

`issue-analyze`, `issue-create`, `issue-verify`, and `issue-fix` consult the `pr` plugin's `pr-oracle` agent, when installed, for a profile of the repo (templates, test layout, monorepo packages) and, in `issue-fix`, for remembered review rules around the fix, and hand coding loops to its `pr-sidekick` agent. The oracle is `pr:pr-oracle` in Claude Code, the `pr-oracle` subagent in Cursor — install `pr` to get it. Without it, each skill works the same minus the memory, and says to update a stale PR description by hand instead of suggesting `/pr:pr-sync` (`CONVENTIONS.md` → "Companion plugin: `pr`").
