#!/usr/bin/env bash
# Links every skill folder in this repo into ~/.claude/skills/,
# so Claude Code picks them up without copying files (git pull = instant update
# on this machine).
#
# Skills are expected under the group directories (pr-skills/, opensource-skills/),
# one folder per skill, each containing a SKILL.md.
#
# Usage: ./install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.claude/skills"
GROUP_DIRS=("pr-skills" "opensource-skills")

mkdir -p "$TARGET_DIR"

for group in "${GROUP_DIRS[@]}"; do
  group_path="${REPO_DIR}/${group}"

  if [ ! -d "$group_path" ]; then
    continue
  fi

  for skill_path in "$group_path"/*/; do
    skill_name="$(basename "$skill_path")"

    # Skip non-skill dirs (anything without a SKILL.md)
    if [ ! -f "${skill_path}SKILL.md" ]; then
      continue
    fi

    link_path="${TARGET_DIR}/${skill_name}"

    if [ -L "$link_path" ]; then
      echo "Updating link: $skill_name"
      rm "$link_path"
    elif [ -e "$link_path" ]; then
      echo "Skipping $skill_name — a real (non-symlink) folder already exists at $link_path"
      continue
    fi

    ln -s "${skill_path%/}" "$link_path"
    echo "Linked: $skill_name -> $link_path"
  done
done

echo "Done. Restart Claude Code (or start a new session) to pick up changes."
