#!/usr/bin/env bash
# Cursor wrapper around memory-sync.sh.
#
# memory-sync.sh speaks Claude Code: plain text on stdout, warnings on stderr,
# always exit 0. Cursor hook stdout has to be JSON, and a `stop` hook must not
# return followup_message or it will send another user turn.
#
#   cursor-memory-sync.sh pull [repo]
#   cursor-memory-sync.sh push [repo]
#
# The optional repo argument is the plugin variable PR_SIDEKICK_MEMORY_REPO,
# used only when that variable is not already in the environment. An
# unsubstituted placeholder is ignored.

set -u

mode="${1:-}"
repo_arg="${2:-}"
if [ -z "${PR_SIDEKICK_MEMORY_REPO:-}" ] && [ -n "$repo_arg" ] && [ "$repo_arg" != '${PR_SIDEKICK_MEMORY_REPO}' ]; then
  export PR_SIDEKICK_MEMORY_REPO="$repo_arg"
fi

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\t'/\\t}
  s=${s//$'\r'/}
  printf '%s' "$s"
}

dir="$(cd "$(dirname "$0")" && pwd)"
out="$("$dir/memory-sync.sh" "$mode")"

if [ "$mode" = pull ] && [ -n "$out" ]; then
  printf '{"additional_context":"%s"}\n' "$(json_escape "$out")"
else
  printf '{}\n'
fi
exit 0
