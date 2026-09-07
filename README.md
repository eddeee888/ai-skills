# ai-skills

AI skills kit — a Claude Code plugin marketplace.

## Structure

This repo is a [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces.md)
(`.claude-plugin/marketplace.json`) containing two plugins, each its own
namespace of slash commands:

- [`oss/`](oss/) — the `oss` plugin, skills for maintaining and contributing
  to open source projects. Skills invoke as `/oss:<skill-name>`, e.g.
  `/oss:verify`, `/oss:fix`.
- [`pr/`](pr/) — the `pr` plugin, skills for working with pull requests.
  Skills invoke as `/pr:<skill-name>`, e.g. `/pr:pr-sync-changes`.

Each plugin has its own `.claude-plugin/plugin.json` manifest, and each skill
lives in its own directory within a plugin, e.g. `oss/skills/<skill-name>/SKILL.md`.

## Install

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
