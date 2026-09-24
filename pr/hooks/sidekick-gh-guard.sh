#!/usr/bin/env bash
# PreToolUse hook on Bash: keeps pr-sidekick's `gh` use read-only. The
# sidekick must never write to GitHub, but Bash can run `gh api -X POST` or
# `gh pr edit`; this blocks those for the sidekick only. Every other agent
# and the main chat pass straight through, so skills can still post replies.
#
# Plugin agents can't carry their own `hooks`, so this runs for every Bash
# call and exits at once unless the call comes from the sidekick running as
# a subagent: `agent_type` is the sidekick and `agent_id` is set. A session
# started with `claude --agent pr:pr-sidekick` has no `agent_id`, so the
# user's own coding session keeps its gh writes.
#
# Allowed for the sidekick: `gh auth status`, `gh pr view|diff|list|checks`,
# `gh issue view|list`, `gh repo view`, and `gh api` reads (GET, or a GraphQL
# query that isn't a mutation). Anything else that starts with `gh` is
# blocked with exit 2, and the reason tells the sidekick to use its
# read-only GitHub MCP tools instead.
#
# A guard against mistakes, not an adversary: `gh` run through `eval`,
# `xargs` or `bash -c` isn't inspected.

set -u

input="$(cat)"
printf '%s' "$input" | grep -qE '"agent_type"[[:space:]]*:[[:space:]]*"(pr:)?pr-sidekick"' || exit 0
printf '%s' "$input" | grep -qE '"agent_id"[[:space:]]*:[[:space:]]*"[^"]' || exit 0

block() {
  echo "pr-sidekick is read-only on GitHub: $1. Use the read-only GitHub MCP tools listed in \"GitHub access\" instead." >&2
  exit 2
}

if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
elif command -v python3 >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"
else
  # Can't read the command: fail closed on anything mentioning gh.
  printf '%s' "$input" | grep -qE '(^|[^[:alnum:]_-])gh[[:space:]]' && block "can't inspect this gh command (no jq or python3)"
  exit 0
fi

# One command per line: split on && || ; | $( and backticks. Text after a
# split inside quotes (e.g. a --jq filter) becomes a line that doesn't start
# with gh, which is ignored.
segments="$(printf '%s\n' "$cmd" | awk '{ gsub(/&&|\|\||;|\||\$\(|`/, "\n"); print }')"

while IFS= read -r seg; do
  # Drop leading spaces, a subshell paren, and VAR=value prefixes.
  seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:](]*//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//')"
  case "$seg" in
    gh | gh[[:space:]]*) ;;
    *) continue ;;
  esac
  read -r _ sub action _ <<<"$seg"
  case "$sub $action" in
    "auth status" | "pr view" | "pr diff" | "pr list" | "pr checks" | "issue view" | "issue list" | "repo view") continue ;;
  esac
  [ "$sub" = api ] || block "\`gh $sub ${action:-}\` isn't a read"

  # `gh api` from here to the end of the whole command: flags can sit after
  # a quoted --jq filter that the split above cut through.
  rest="${cmd#*"$seg"}"
  api="$seg$rest"
  method="$(printf '%s' "$api" | grep -oE '(^|[[:space:]])(-X|--method)[[:space:]=]*[A-Za-z]+' | head -n 1 | sed -E 's/.*(-X|--method)[[:space:]=]*//' | tr '[:lower:]' '[:upper:]')"
  if [ -n "$method" ] && [ "$method" != GET ]; then
    block "\`gh api\` with method $method"
  fi
  if [ "$action" = graphql ]; then
    printf '%s' "$api" | grep -qiE '(^|[^[:alnum:]_])mutation([^[:alnum:]_]|$)' && block "a GraphQL mutation"
    continue
  fi
  # REST: -f/-F/--input switch gh api to POST unless GET was set explicitly.
  if [ "$method" != GET ] && printf '%s' "$api" | grep -qE '(^|[[:space:]])(-[fF]|--field|--raw-field|--input)'; then
    block "\`gh api\` with fields (a POST)"
  fi
done <<<"$segments"

exit 0
