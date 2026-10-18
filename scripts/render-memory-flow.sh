#!/usr/bin/env bash
# Renders docs/memory-flow.html to docs/memory-flow.png, stamped with the plugin versions.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/sync-memory-flow-versions.mjs

pnpm exec playwright install chromium
pnpm exec playwright screenshot \
  --device="Desktop Chrome HiDPI" --viewport-size=1080,600 --color-scheme=dark \
  --wait-for-selector='html[data-ready="yes"]' --full-page \
  "file://$PWD/docs/memory-flow.html" docs/memory-flow.png
