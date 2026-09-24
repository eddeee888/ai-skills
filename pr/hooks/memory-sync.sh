#!/usr/bin/env bash
# Syncs agent memory (~/.claude/agent-memory, where pr-sidekick keeps what
# it learns — memory/ inside that directory) with a private git repo,
# so it survives machines and short-lived cloud containers. Claude Code calls
# this script directly; Cursor calls it through cursor-memory-sync.sh.
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

self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

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

remote_has_branch() {
  [ -n "$(git -C "$dir" ls-remote --heads origin "$branch" 2>/dev/null)" ]
}

clone() {
  local tmp
  tmp="$(mktemp -d)" || return 1
  if ! GIT_TERMINAL_PROMPT=0 git clone -q "$url" "$tmp/memory" 2>/dev/null; then
    warn "can't clone $repo — check it exists and this session can reach it"
    [ "$mode" = pull ] && ask_claude_to_attach
    rm -rf "$tmp"
    return 1
  fi
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

mode="${1:-}"
case "$mode" in
  pull) pull ;;
  push) push ;;
  *) warn "usage: memory-sync.sh pull|push" ;;
esac
exit 0
