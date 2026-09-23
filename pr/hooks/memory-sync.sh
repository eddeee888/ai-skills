#!/usr/bin/env bash
# Syncs Claude Code agent memory (~/.claude/agent-memory, where pr-sidekick
# keeps what it learns) with a private git repo, so it survives machines and
# short-lived cloud containers.
#
#   memory-sync.sh pull   # SessionStart: bring memory down
#   memory-sync.sh push   # Stop / SessionEnd: send changes up
#
# Opt-in: does nothing unless PR_SIDEKICK_MEMORY_REPO is set, to `owner/repo`
# (GitHub over HTTPS) or a full git URL. Never fails the session: every
# problem is reported on stderr and the script exits 0.

set -u

repo="${PR_SIDEKICK_MEMORY_REPO:-}"
[ -n "$repo" ] || exit 0

dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-memory"
branch=main
case "$repo" in
  *://* | git@*) url="$repo" ;;
  *) url="https://github.com/$repo.git" ;;
esac

warn() { echo "pr-sidekick memory sync: $*" >&2; }

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

remote_has_branch() {
  [ -n "$(git -C "$dir" ls-remote --heads origin "$branch" 2>/dev/null)" ]
}

clone() {
  local tmp
  tmp="$(mktemp -d)" || return 1
  if ! git clone -q "$url" "$tmp/memory" 2>/dev/null; then
    warn "can't clone $repo — check it exists and this session can reach it"
    rm -rf "$tmp"
    return 1
  fi
  # Check out the sync branch whatever the remote's default is; an empty repo
  # just gets pointed at it for the first push.
  git -C "$tmp/memory" checkout -q "$branch" 2>/dev/null ||
    git -C "$tmp/memory" symbolic-ref HEAD "refs/heads/$branch"
  if [ -d "$dir" ]; then
    # Memory written before sync was set up: keep a backup, and carry over
    # anything the repo doesn't already have (the repo wins on conflicts).
    local backup
    backup="$dir.bak-$(date +%Y%m%d%H%M%S)"
    cp -R "$dir" "$backup"
    cp -Rn "$dir/." "$tmp/memory/" 2>/dev/null
    rm -rf "$dir"
    warn "merged existing memory into the sync repo; backup at $backup"
  fi
  mkdir -p "$(dirname "$dir")"
  mv "$tmp/memory" "$dir"
  rm -rf "$tmp"
  union_merge
}

pull() {
  if [ ! -d "$dir/.git" ]; then
    clone
    return
  fi
  union_merge
  remote_has_branch || return 0
  g pull -q --rebase --autostash origin "$branch" 2>/dev/null ||
    { g rebase --abort 2>/dev/null; warn "pull failed; keeping local memory as is"; }
}

push() {
  [ -d "$dir/.git" ] || { pull || return 0; }
  union_merge
  g add -A
  if ! g diff --cached --quiet; then
    g commit -q -m "sync from $(hostname)" || return 0
  fi
  if remote_has_branch; then
    g pull -q --rebase origin "$branch" 2>/dev/null ||
      { g rebase --abort 2>/dev/null; warn "remote changed in a conflicting way; resolve in $dir"; return 0; }
  fi
  [ -n "$(g log --oneline "origin/$branch..HEAD" 2>/dev/null || g log --oneline -1)" ] || return 0
  g push -q origin "HEAD:$branch" 2>/dev/null || warn "push to $repo failed; will retry next time"
}

case "${1:-}" in
  pull) pull ;;
  push) push ;;
  *) warn "usage: memory-sync.sh pull|push" ;;
esac
exit 0
