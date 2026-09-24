#!/usr/bin/env bash
# Syncs agent memory (~/.claude/agent-memory, where pr-sidekick keeps what
# it learns — memory/ inside that directory) with a private git repo,
# so it survives machines and short-lived cloud containers. Claude Code calls
# this script directly; Cursor calls it through cursor-memory-sync.sh.
#
#   memory-sync.sh pull   # SessionStart: bring memory down
#   memory-sync.sh push   # Stop (every turn): send changes up
#   memory-sync.sh end    # SessionEnd: push, retrying an unreachable repo
#
# Memory is pushed to a branch per GitHub user, sidekick/<login>, never to
# main: what someone's sessions learn collects there, for a PR to review and
# merge. Pull brings in both main and that branch, merging rather than
# rebasing so the branch only ever moves forward. The login comes from
# `gh api user`, or the GitHub API directly (GH_TOKEN/GITHUB_TOKEN, or a
# proxy that authenticates for us), once per session start.
#
# Stop fires after every turn, so push stays off the network unless there's
# something to send: nothing new → no fetch or push. A repo that
# couldn't be cloned isn't retried on each turn either — only once the last
# failure is RETRY_MINUTES old, and always at session end.
#
# Opt-in: does nothing unless PR_SIDEKICK_MEMORY_REPO is set, to `owner/repo`
# (GitHub over HTTPS) or a full git URL. Never fails the session: every
# problem is reported on stderr and the script exits 0.

set -u

repo="${PR_SIDEKICK_MEMORY_REPO:-}"
[ -n "$repo" ] || exit 0

dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-memory"
branch=main
branch_prefix=sidekick/
login_file="$dir/.git/pr-sidekick-login"
login_failed="$dir/.git/pr-sidekick-login-failed"
case "$repo" in
  *://* | git@*) url="$repo" ;;
  *) url="https://github.com/$repo.git" ;;
esac

self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
unreachable="$dir.unreachable"
RETRY_MINUTES=10

warn() { echo "pr-sidekick memory sync: $*" >&2; }

# SessionStart stdout goes into Claude's context: when the memory repo can't
# be reached, ask Claude to attach it (a cloud session only reaches repos
# attached to it) and pull again, instead of leaving the user to notice.
ask_claude_to_attach() {
  cat <<MSG
pr-sidekick memory sync: couldn't reach the memory repo \`$repo\` (PR_SIDEKICK_MEMORY_REPO), so the sidekick's memory from earlier sessions isn't loaded.
- In a Claude Code on the web session with an \`add_repo\` tool: attach \`$repo\` with push access (no need to clone it yourself), then run \`"$self" pull\` so memory is in place before the pr-sidekick agent is used. Mention it to the user in one line.
- Otherwise, or if attaching fails: tell the user in one line that memory sync couldn't reach \`$repo\` and why, and carry on — the skills work without memory.
MSG
}

g() {
  # Commit as the user when git knows who they are; otherwise as the sync.
  if [ -n "$(git -C "$dir" config user.email 2>/dev/null)" ]; then
    git -C "$dir" "$@"
  else
    git -C "$dir" -c user.name="pr-sidekick memory sync" -c user.email="pr-sidekick@localhost" "$@"
  fi
}

union_merge() {
  # Memory files are line-oriented markdown: when two machines changed the
  # same spot, keep both sides' lines rather than stopping on a conflict —
  # the sidekick's upkeep merges the duplicates on its next write.
  mkdir -p "$dir/.git/info"
  grep -qs 'merge=union' "$dir/.git/info/attributes" || echo '* merge=union' >> "$dir/.git/info/attributes"
}

clone() {
  local tmp
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
    local backup f
    backup="$dir.bak-$(date +%Y%m%d%H%M%S)"
    cp -R "$dir" "$backup"
    (cd "$dir" && find . -type f ! -path './.git/*') | while IFS= read -r f; do
      if [ -e "$tmp/memory/$f" ]; then
        grep -vxFf "$tmp/memory/$f" "$dir/$f" >> "$tmp/memory/$f"
      else
        mkdir -p "$(dirname "$tmp/memory/$f")"
        cp "$dir/$f" "$tmp/memory/$f"
      fi
    done
    rm -rf "$dir"
    warn "merged existing memory into the sync repo; backup at $backup"
  fi
  mkdir -p "$(dirname "$dir")"
  mv "$tmp/memory" "$dir"
  rm -rf "$tmp"
  union_merge
}

commit_changes() {
  g add -A
  g diff --cached --quiet || g commit -q -m "sync from $(hostname)"
}

# sidekick/<login>, from the first of these that gives a login, else empty:
#   login cached at the last pull: alice               → sidekick/alice
#   `gh api user`, else api.github.com/user: alice     → sidekick/alice (cached)
#   both fail, one tree memory/users/alice/            → sidekick/alice
#   both fail, trees memory/users/alice/ and bob/      → (empty)
# Like an unreachable repo, a failed lookup is only retried once it's
# RETRY_MINUTES old, and at session end; until then it goes straight to the
# memory/users/ fallback.
user_branch() {
  local login="" users token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  login="$(cat "$login_file" 2>/dev/null)"
  if [ -z "$login" ] && { [ "$mode" = end ] || [ -z "$(find "$login_failed" -mmin -"$RETRY_MINUTES" 2>/dev/null)" ]; }; then
    command -v gh >/dev/null 2>&1 && login="$(gh api user --jq .login 2>/dev/null)"
    [ -n "$login" ] || login="$(curl -fsS -m 10 ${token:+-H "Authorization: Bearer $token"} https://api.github.com/user 2>/dev/null |
      sed -nE 's/^[[:space:]]*"login"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' | head -n 1)"
    if [ -n "$login" ]; then
      printf '%s\n' "$login" > "$login_file"
      rm -f "$login_failed"
    else
      touch "$login_failed"
    fi
  fi
  if [ -z "$login" ]; then
    users="$(ls "$dir/memory/users" 2>/dev/null)"
    [ "$(printf '%s\n' "$users" | grep -c .)" = 1 ] && login="$users"
  fi
  [ -n "$login" ] && printf '%s%s' "$branch_prefix" "$login"
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
  rm -f "$login_file" "$login_failed"
  local ub
  ub="$(user_branch)"
  commit_changes
  merge_remote "$branch"
  [ -n "$ub" ] && merge_remote "$ub"
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
  [ -n "$ub" ] || { warn "can't tell your GitHub login; memory kept locally, not pushed"; return 0; }
  ahead "$ub" || return 0
  # Another machine of the same user may have pushed since: take that first.
  merge_remote "$ub"
  [ $? = 2 ] && return 0
  g push -q origin "HEAD:refs/heads/$ub" 2>/dev/null || warn "push to $ub on $repo failed; will retry next time"
}

mode="${1:-}"
case "$mode" in
  pull) pull ;;
  push | end) push ;;
  *) warn "usage: memory-sync.sh pull|push|end" ;;
esac
exit 0
