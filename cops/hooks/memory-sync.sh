#!/usr/bin/env bash
# Syncs the dedicated pr-oracle memory directory with a private git repo,
# so it survives machines and short-lived cloud containers. Claude Code calls
# this script directly; Cursor calls it through cursor-memory-sync.sh.
#
#   memory-sync.sh pull   # SessionStart: bring memory down
#   memory-sync.sh push   # Stop (every turn): send changes up
#   memory-sync.sh end    # SessionEnd: push, retrying an unreachable repo
#
# Memory is pushed to a branch per GitHub user, memory/<login>, never to
# main: what someone's sessions learn collects there, for a PR to review and
# merge. Pull brings in both main and that branch, merging rather than
# rebasing so the branch only ever moves forward. The login is configured,
# never looked up with a credential: the plugin's github_login option
# (CLAUDE_PLUGIN_OPTION_GITHUB_LOGIN) or PR_MEMORY_LOGIN.
#
# Stop fires after every turn, so push stays off the network unless there's
# something to send: nothing new → no fetch or push. A repo that
# couldn't be cloned isn't retried on each turn either — only once the last
# failure is RETRY_MINUTES old, and always at session end.
#
# Opt-in: does nothing unless the memory repo is set — the plugin's
# memory_repo option (CLAUDE_PLUGIN_OPTION_MEMORY_REPO) or PR_MEMORY_REPO —
# to `owner/repo` (GitHub over HTTPS) or a full git URL. Never fails the
# session: every problem is reported on stderr and the script exits 0.

set -u

repo="${PR_MEMORY_REPO:-${CLAUDE_PLUGIN_OPTION_MEMORY_REPO:-}}"
dir="${PR_MEMORY_DIR:-${CLAUDE_PLUGIN_OPTION_MEMORY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cops-memory}}"
login="${PR_MEMORY_LOGIN:-${CLAUDE_PLUGIN_OPTION_GITHUB_LOGIN:-}}"
legacy="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-memory/memory"
legacy_stub="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-memory/cops-pr-oracle/MEMORY.md"
branch=main
branch_prefix=memory/
case "$repo" in
  *://* | git@*) url="$repo" ;;
  *) url="https://github.com/$repo.git" ;;
esac

self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
unreachable="$dir.unreachable"
RETRY_MINUTES=10

warn() { echo "pr-oracle memory sync: $*" >&2; }

valid_login() {
  case "$1" in
    "" | *[!A-Za-z0-9-]* | -* | *-) return 1 ;;
    *) return 0 ;;
  esac
}

resolve_login() {
  local users
  valid_login "$login" && return 0
  users="$(ls "$dir/memory/users" 2>/dev/null)"
  [ "$(printf '%s\n' "$users" | grep -c .)" = 1 ] && login="$users"
  if ! valid_login "$login"; then
    users="$(ls "$legacy/users" 2>/dev/null)"
    [ "$(printf '%s\n' "$users" | grep -c .)" = 1 ] && login="$users"
  fi
  valid_login "$login"
}

merge_file() {
  local src=$1 dest=$2 line
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname "$dest")"
  touch "$dest"
  while IFS= read -r line || [ -n "$line" ]; do
    grep -qxF -- "$line" "$dest" 2>/dev/null || printf '%s\n' "$line" >> "$dest"
  done < "$src"
}

merge_legacy_stub() {
  local line candidate dest="$dir/memory/users/$login/candidates.md" imported=1
  [ -f "$legacy_stub" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      "" | "# Index" | 'Rules live under `memory/`, not in this file. Read `memory/users/<github-login>/MEMORY.md` and `memory/team/MEMORY.md`.' | \#* | '```'*) continue ;;
    esac
    candidate="${line#- }"
    [ -n "$candidate" ] || continue
    candidate="- $candidate  (legacy cops-pr-oracle/MEMORY.md)"
    if [ "$imported" = 1 ]; then
      mkdir -p "$(dirname "$dest")"
      [ -s "$dest" ] || printf '## Everywhere\n' > "$dest"
      imported=0
    fi
    grep -qxF -- "$candidate" "$dest" 2>/dev/null || printf '%s\n' "$candidate" >> "$dest"
  done < "$legacy_stub"
  return "$imported"
}

marker_path() {
  if [ -d "$dir/.git" ]; then
    printf '%s' "$dir/.git/cops-legacy-import-v1"
  else
    printf '%s' "$dir/.cops-legacy-import-v1"
  fi
}

legacy_import() {
  local marker src rel backup imported=0
  valid_login "$login" || return 0
  marker="$(marker_path)"
  [ -e "$marker" ] && return 0
  if [ -d "$legacy/users/$login" ] || [ -d "$legacy/team" ] || [ -f "$legacy_stub" ]; then
    backup="${dir}.legacy-import-backup-$(date +%Y%m%d%H%M%S)"
    mkdir -p "$backup"
    [ -d "$legacy/users/$login" ] && cp -R "$legacy/users/$login" "$backup/user"
    [ -d "$legacy/team" ] && cp -R "$legacy/team" "$backup/team"
    if [ -d "$legacy/users/$login" ]; then
      while IFS= read -r -d '' src; do
        rel="${src#"$legacy/users/$login/"}"
        merge_file "$src" "$dir/memory/users/$login/$rel"
        imported=1
      done < <(find "$legacy/users/$login" -type f -print0)
    fi
    if [ -d "$legacy/team" ]; then
      while IFS= read -r -d '' src; do
        rel="${src#"$legacy/team/"}"
        merge_file "$src" "$dir/memory/team/$rel"
        imported=1
      done < <(find "$legacy/team" -type f -print0)
    fi
    if [ -f "$legacy_stub" ]; then
      mkdir -p "$backup/cops-pr-oracle"
      cp "$legacy_stub" "$backup/cops-pr-oracle/MEMORY.md"
      merge_legacy_stub && imported=1
    fi
    if [ "$imported" = 1 ]; then
      mkdir -p "$(dirname "$marker")"
      touch "$marker"
      warn "imported legacy memory; source preserved and backed up at $backup"
    else
      rm -rf "$backup"
    fi
  fi
}

# SessionStart stdout goes into Claude's context: when the memory repo can't
# be reached, ask Claude to attach it (a cloud session only reaches repos
# attached to it) and pull again, instead of leaving the user to notice.
ask_claude_to_attach() {
  cat <<MSG
pr-oracle memory sync: couldn't reach the memory repo \`$repo\`, so the oracle's memory from earlier sessions isn't loaded.
- In a Claude Code on the web session with an \`add_repo\` tool: attach \`$repo\` with push access (no need to clone it yourself), then run \`"$self" pull\` so memory is in place before the pr-oracle agent is used. Mention it to the user in one line.
- Otherwise, or if attaching fails: tell the user in one line that memory sync couldn't reach \`$repo\` and why, and carry on — the skills work without memory.
MSG
}

g() {
  # Commit as the user when git knows who they are; otherwise as the sync.
  if [ -n "$(git -C "$dir" config user.email 2>/dev/null)" ]; then
    git -C "$dir" "$@"
  else
    git -C "$dir" -c user.name="pr-oracle memory sync" -c user.email="pr-oracle@localhost" "$@"
  fi
}

union_merge() {
  # Memory files are line-oriented markdown: when two machines changed the
  # same spot, keep both sides' lines rather than stopping on a conflict —
  # the oracle's upkeep merges the duplicates on its next write.
  mkdir -p "$dir/.git/info"
  grep -qs 'merge=union' "$dir/.git/info/attributes" || echo '* merge=union' >> "$dir/.git/info/attributes"
}

clone() {
  local tmp imported_marker=""
  tmp="$(mktemp -d)" || return 1
  if ! GIT_TERMINAL_PROMPT=0 git clone -q "$url" "$tmp/memory" 2>/dev/null; then
    warn "can't clone $repo — check it exists and this session can reach it"
    [ "$mode" = pull ] && ask_claude_to_attach
    rm -rf "$tmp"
    touch "$unreachable"
    return 1
  fi
  rm -f "$unreachable"
  # Check out the sync branch whatever the remote's default is; an empty repo
  # just gets pointed at it for the first push.
  git -C "$tmp/memory" checkout -q "$branch" 2>/dev/null ||
    git -C "$tmp/memory" symbolic-ref HEAD "refs/heads/$branch"
  if [ -d "$dir" ]; then
    # Memory written before this machine first synced (sync just set up, or
    # a cloud session that couldn't reach the repo at start): keep a backup,
    # copy over files the repo lacks, and append local lines the repo's copy
    # of a shared file doesn't have — the same keep-both rule as union_merge.
    local backup src rel suffix=0
    backup="$dir.bak-$(date +%Y%m%d%H%M%S)"
    while [ -e "$backup" ]; do
      suffix=$((suffix + 1))
      backup="$dir.bak-$(date +%Y%m%d%H%M%S)-$suffix"
    done
    [ -e "$dir/.cops-legacy-import-v1" ] && imported_marker=1
    if valid_login "$login" && [ -d "$dir/memory/users/$login" ]; then
      while IFS= read -r -d '' src; do
        rel="${src#"$dir/memory/users/$login/"}"
        merge_file "$src" "$tmp/memory/memory/users/$login/$rel"
      done < <(find "$dir/memory/users/$login" -type f -print0)
    fi
    if [ -d "$dir/memory/team" ]; then
      while IFS= read -r -d '' src; do
        rel="${src#"$dir/memory/team/"}"
        merge_file "$src" "$tmp/memory/memory/team/$rel"
      done < <(find "$dir/memory/team" -type f -print0)
    fi
    if ! mv "$dir" "$backup"; then
      warn "couldn't move existing memory to $backup; sync clone not installed"
      rm -rf "$tmp"
      return 1
    fi
    warn "merged existing memory into the sync repo; backup at $backup"
  fi
  mkdir -p "$(dirname "$dir")"
  if ! mv "$tmp/memory" "$dir"; then
    warn "couldn't install sync clone at $dir"
    if [ -n "${backup:-}" ] && mv "$backup" "$dir"; then
      warn "restored existing memory after install failure"
      rm -rf "$tmp"
    else
      warn "existing memory remains intact at ${backup:-<no backup>}; merged clone remains at $tmp/memory"
    fi
    return 1
  fi
  rm -rf "$tmp"
  [ -n "$imported_marker" ] && touch "$dir/.git/cops-legacy-import-v1"
  union_merge
}

commit_changes() {
  g reset -q 2>/dev/null || true
  g add -- memory/team 2>/dev/null || true
  valid_login "$login" && g add -- "memory/users/$login" 2>/dev/null || true
  g diff --cached --quiet || g commit -q -m "sync from $(hostname)"
}

# memory/<login>, from the first of these that gives a login, else empty:
#   github_login option or PR_MEMORY_LOGIN: alice      → memory/alice
#   neither set, one tree memory/users/alice/          → memory/alice
#   neither set, trees memory/users/alice/ and bob/    → (empty)
user_branch() {
  resolve_login >/dev/null 2>&1 || true
  valid_login "$login" && printf '%s%s' "$branch_prefix" "$login"
}

# Fetch a remote branch and merge it in; false when it isn't on the remote.
merge_remote() {
  g fetch -q origin "+refs/heads/$1:refs/remotes/origin/$1" 2>/dev/null || return 1
  g merge -q --no-edit "origin/$1" >/dev/null 2>&1 ||
    { g merge --abort 2>/dev/null; warn "couldn't merge $1; resolve in $dir"; return 2; }
}

pull() {
  if [ ! -d "$dir/.git" ]; then
    clone || return 0
  fi
  union_merge
  local ub
  ub="$(user_branch)"
  commit_changes
  merge_remote "$branch"
  if [ -n "$ub" ]; then
    merge_remote "$ub"
  fi
  return 0
}

# True when HEAD has commits of its own that neither main nor the given
# branch (if any) has — judged from the last fetch, no network call. Merges
# don't count, so bringing in a newer main alone pushes nothing. An empty
# clone (no commits yet) has nothing to send.
ahead() {
  local ref bases=""
  git -C "$dir" rev-parse -q --verify HEAD >/dev/null || return 1
  for ref in ${1:+"origin/$1"} "origin/$branch"; do
    git -C "$dir" rev-parse -q --verify "refs/remotes/$ref" >/dev/null && bases="$bases $ref"
  done
  # shellcheck disable=SC2086
  [ "$(git -C "$dir" rev-list --no-merges --count HEAD --not $bases)" != 0 ]
}

push() {
  if [ ! -d "$dir/.git" ]; then
    # Nothing written locally → nothing to carry into the repo yet.
    [ -n "$(find "$dir" -type f 2>/dev/null | head -n 1)" ] || return 0
    # The clone failed recently: don't retry it on every turn.
    if [ "$mode" != end ] && [ -n "$(find "$unreachable" -mmin -"$RETRY_MINUTES" 2>/dev/null)" ]; then
      return 0
    fi
    clone || return 0
  fi
  union_merge
  commit_changes || return 0
  # Nothing beyond main → nothing to send, without looking up the login.
  ahead "" || return 0
  local ub
  ub="$(user_branch)"
  [ -n "$ub" ] || { warn "can't tell your GitHub login — set the github_login option or PR_MEMORY_LOGIN; memory kept locally, not pushed"; return 0; }
  ahead "$ub" || return 0
  # Another machine of the same user may have pushed since: take that first.
  merge_remote "$ub"
  [ $? = 2 ] && return 0
  g push -q origin "HEAD:refs/heads/$ub" 2>/dev/null || warn "push to $ub on $repo failed; will retry next time"
}

mode="${1:-}"
resolve_login >/dev/null 2>&1 || true
legacy_import
[ -n "$repo" ] || exit 0
case "$mode" in
  pull) pull ;;
  push | end) push ;;
  *) warn "usage: memory-sync.sh pull|push|end" ;;
esac
exit 0
