# ai-skills

AI skills kit — a plugin marketplace for Claude Code and Cursor.

## Structure

Two plugins, cataloged in:

- [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) — Claude Code catalog
- [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) — Cursor catalog

Each plugin is a namespace of skills:

- [`oss/`](oss/) — maintaining and contributing to open source projects. Claude Code: `/oss:<skill-name>`, e.g. `/oss:issue-verify`, `/oss:issue-fix`. Cursor: the skill name, e.g. `/issue-verify`.
- [`pr/`](pr/) — working with pull requests. Claude Code: `/pr:<skill-name>`, e.g. `/pr:pr-sync`. Cursor: `/pr-sync`.

The `pr` plugin also ships two agents. [`pr-oracle`](pr/agents/pr-oracle.md) holds persistent memory of your recurring review themes; the `pr` skills and `oss:issue-analyze`, `issue-create`, `issue-verify` and `issue-fix` consult it for a repo's working setup and when classifying threads, coding, reviewing, and writing PR descriptions. [`pr-sidekick`](pr/agents/pr-sidekick.md) runs the coding loops those skills hand off — implement, test, commit — with the same remembered preferences, on a model the calling skill picks per job. Claude Code runs them as `pr:pr-oracle` and `pr:pr-sidekick`; Cursor runs the same files as subagents.

Each plugin has `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` manifests. Each skill lives in its own directory within a plugin, e.g. `oss/skills/<skill-name>/SKILL.md`.

Formatting/process rules shared by more than one skill (e.g. the `[package-name]` PR title prefix for monorepos) live in [`CONVENTIONS.md`](CONVENTIONS.md); skills point to it instead of restating them. Style rules there are marked *Default*: a repo's `CLAUDE.md`, the oracle's team or personal memory, or the current conversation can override them. The rest are contracts the skills depend on. An installed plugin only gets its own directory, so `pr/` and `oss/` each carry an identical copy; edit the root file, then copy it over both.

## Install

### Claude Code

Add the marketplace, then install the plugin(s) you want:

```
/plugin marketplace add eddeee888/ai-skills
/plugin install oss
/plugin install pr
```

Local checkout for development:

```
claude --plugin-dir ./oss
claude --plugin-dir ./pr
```

### Cursor

**Anyone / yourself:** add the GitHub catalog, then install `oss` and/or `pr` from Customize or the CLI `/plugin` Marketplace tab:

```
cursor-agent plugin marketplace add https://github.com/eddeee888/ai-skills
```

**Team / Enterprise:** [Dashboard → Plugins → Add Marketplace → Import from Repo](https://cursor.com/docs/plugins), paste `https://github.com/eddeee888/ai-skills`, review `oss` and `pr`, set access and Default Off / On / Required. Optionally enable Auto Refresh (needs the [Cursor GitHub App](https://cursor.com/docs/integrations/github.md) on this repo).

**Official public listing (optional):** submit this repo at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). Manual review; the repo must stay public and open source.

Local checkout for development: copy `oss` and `pr` into `~/.cursor/plugins/local/` (do not symlink from outside that folder) and reload the window.
