# ai-skills

AI skills kit — a plugin marketplace for Claude Code and Cursor.

## Structure

This repo is a plugin marketplace containing two plugins:

- [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) — Claude Code catalog
- [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) — Cursor catalog

Each plugin is its own namespace of skills:

- [`oss/`](oss/) — the `oss` plugin, skills for maintaining and contributing to open source projects. Skills invoke as `/oss:<skill-name>` in Claude Code, e.g. `/oss:issue-verify`, `/oss:issue-fix`. In Cursor, invoke the skill name (e.g. `/issue-verify`).
- [`pr/`](pr/) — the `pr` plugin, skills for working with pull requests. Skills invoke as `/pr:<skill-name>` in Claude Code, e.g. `/pr:pr-sync`. In Cursor, invoke `/pr-sync`.

Each plugin has `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` manifests. Each skill lives in its own directory within a plugin, e.g. `oss/skills/<skill-name>/SKILL.md`.

## Install

### Claude Code

Add this repo as a marketplace, then install whichever plugin(s) you want:

```
/plugin marketplace add eddeee888/ai-skills
/plugin install oss
/plugin install pr
```

To develop against a local checkout instead:

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

To develop against a local checkout, copy `oss` and `pr` into `~/.cursor/plugins/local/` (do not symlink from outside that folder) and reload the window.
