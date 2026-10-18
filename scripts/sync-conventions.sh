#!/usr/bin/env bash
# Copy the root CONVENTIONS*.md files over each plugin's copy (cops/ and oss/).

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for root_copy in "$ROOT"/CONVENTIONS*.md; do
  [ -f "$root_copy" ] || continue
  for plugin in cops oss; do
    cp "$root_copy" "$ROOT/$plugin/${root_copy##*/}" || exit 1
  done
done

echo "Synced root CONVENTIONS*.md to cops/ and oss/."
