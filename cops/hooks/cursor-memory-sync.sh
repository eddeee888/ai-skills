#!/usr/bin/env bash
# Cursor wrapper around memory-sync.sh.
#
# memory-sync.sh speaks Claude Code: plain text on stdout, warnings on stderr,
# always exit 0. Cursor hook stdout has to be JSON, and a `stop` hook must not
# return followup_message or it will send another user turn.
#
#   cursor-memory-sync.sh pull [repo] [login]
#   cursor-memory-sync.sh push [repo] [login]
#   cursor-memory-sync.sh end [repo] [login]
#
# The optional arguments are the plugin variables PR_MEMORY_REPO and
# PR_MEMORY_LOGIN, each used only when that variable is not already in the
# environment. An unsubstituted placeholder is ignored.

set -u

mode="${1:-}"
repo_arg="${2:-}"
login_arg="${3:-}"
if [ -z "${PR_MEMORY_REPO:-}" ] && [ -n "$repo_arg" ] && [ "$repo_arg" != '${PR_MEMORY_REPO}' ]; then
  export PR_MEMORY_REPO="$repo_arg"
fi
if [ -z "${PR_MEMORY_LOGIN:-}" ] && [ -n "$login_arg" ] && [ "$login_arg" != '${PR_MEMORY_LOGIN}' ]; then
  export PR_MEMORY_LOGIN="$login_arg"
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
