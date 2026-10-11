#!/usr/bin/env bash
# Identifies an attached COPS memory repository without modifying Git state.

set -u

mode="${1:-claude}"
argument="${2:-}"
case "$argument" in
  '${'*'}') argument="" ;;
esac
login_argument="${3:-}"
case "$login_argument" in
  '${'*'}') login_argument="" ;;
esac
memory_path="${PR_MEMORY_PATH:-${argument:-${CLAUDE_PLUGIN_OPTION_MEMORY_PATH:-}}}"
memory_login="${PR_MEMORY_LOGIN:-${login_argument:-${CLAUDE_PLUGIN_OPTION_MEMORY_LOGIN:-}}}"

# Expand portable home-relative configuration without evaluating arbitrary shell.
expand_path() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s/%s' "$HOME" "${1#\~/}" ;;
    '$HOME') printf '%s' "$HOME" ;;
    '$HOME/'*) printf '%s/%s' "$HOME" "${1#\$HOME/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# Resolve symlinks and relative segments; return nothing for a missing directory.
canonical_path() {
  [ -d "$1" ] && (cd "$1" 2>/dev/null && pwd -P)
}

# A tier's model as the user set it; unset, empty, or not a plain model name falls back to the default.
model_value() {
  if printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$'; then
    printf '%s' "$1"
  else
    printf '%s' "$2"
  fi
}

# Cursor hook output is JSON, so escape context text before interpolation.
json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

context="COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory. Pass \`memory-root: unavailable\` and \`memory-login: unset\` to it. At the first COPS skill or agent call this session, tell the user once that memory is off and that setting PR_MEMORY_PATH and PR_MEMORY_LOGIN enables it."
if [ -n "$memory_path" ]; then
  configured="$(canonical_path "$(expand_path "$memory_path")" || true)"
  git_root=""
  [ -n "$configured" ] &&
    git_root="$(GIT_TERMINAL_PROMPT=0 git -C "$configured" rev-parse --show-toplevel 2>/dev/null || true)"

  if [ -n "$configured" ] && [ "$git_root" = "$configured" ]; then
    context="COPS memory root: $configured
Pass this exact path as \`memory-root\` to every pr-oracle call (never to pr-sidekick). COPS must not clone, pull, commit, or push it."
    # Only an explicitly configured GitHub login names the personal tree; never derive it.
    if printf '%s' "$memory_login" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,38})$'; then
      context="$context
COPS memory login: $memory_login
Pass \`memory-login: $memory_login\` to every pr-oracle call."
    else
      context="$context
COPS memory login unset: PR_MEMORY_LOGIN is missing or not a GitHub login. Pass \`memory-login: unset\` to pr-oracle."
    fi
  else
    context="COPS memory unavailable: the configured path is not a Git root. Pass \`memory-root: unavailable\` to pr-oracle."
  fi
fi

# Which model each subagent tier runs on, from the user's COPS_MODEL_* variables; `inherit` keeps the session's model.
# Claude Code's per-call aliases fill unset tiers; Cursor can't set a model per call, so its tiers inherit.
if [ "$mode" = cursor ]; then
  default_light=inherit default_standard=inherit default_deep=inherit
else
  default_light=haiku default_standard=sonnet default_deep=opus
fi
context="$context
COPS models: light=$(model_value "${COPS_MODEL_LIGHT:-}" "$default_light") standard=$(model_value "${COPS_MODEL_STANDARD:-}" "$default_standard") deep=$(model_value "${COPS_MODEL_DEEP:-}" "$default_deep")
Pass a call's tier value as the subagent model, or omit the model for \`inherit\` (\`CONVENTIONS-orchestration.md\` → \"Hand long loops to a subagent\")."

if [ "$mode" = cursor ]; then
  if [ -n "$context" ]; then
    printf '{"additional_context":"%s"}\n' "$(json_escape "$context")"
  else
    printf '{}\n'
  fi
elif [ -n "$context" ]; then
  printf '%s\n' "$context"
fi
