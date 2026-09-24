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
# Memory is pulled from main, but pushed to a branch of its own per session,
# sidekick/<session id>, so what a session learned lands as a branch to review
# and merge rather than straight on main. A session with nothing new pushes
# no branch. The session id comes from the hook's JSON input on stdin.
#
# Stop fires after every turn, so push stays off the network unless there's
# something to send: nothing new → no ls-remote, pull or push. A repo that
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

# The branch this session pushes to: sidekick/<session id>, from the hook's
# stdin JSON (Claude Code's session_id, Cursor's conversation_id). Without
# one, fall back to a branch per machine.
session_branch() {
  local input="" id=""
  [ -t 0 ] || input="$(cat)"
  id="$(printf '%s' "$input" | sed -nE 's/.*"(session_id|conversation_id)"[[:space:]]*:[[:space:]]*"([^"]*)".*/\2/p' | head -n 1)"
  [ -n "$id" ] || id="host-$(hostname)"
  printf '%s%s' "$branch_prefix" "$(printf '%s' "$id" | tr -c 'A-Za-z0-9._-' '-')"
}

# True when HEAD has commits not yet on the session branch (or, before its
# first push, on main) — judged from the last fetch, no network call. An
# empty clone (no commits yet) has nothing to send.
ahead() {
  local base
  git -C "$dir" rev-parse -q --verify HEAD >/dev/null || return 1
  for base in "origin/$push_branch" "origin/$branch"; do
    if git -C "$dir" rev-parse -q --verify "refs/remotes/$base" >/dev/null; then
      [ -n "$(git -C "$dir" log --oneline "$base..HEAD")" ]
      return
    fi
  done
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
  g add -A
  if ! g diff --cached --quiet; then
    g commit -q -m "sync from $(hostname)" || return 0
  fi
  ahead || return 0
  # Only this session writes its branch, so there's nothing to pull first; the
  # lease still refuses to overwrite a branch someone else pushed in between.
  g push -q --force-with-lease="refs/heads/$push_branch" origin "HEAD:refs/heads/$push_branch" 2>/dev/null ||
    warn "push to $push_branch on $repo failed; will retry next time"
}

mode="${1:-}"
case "$mode" in
  pull) pull ;;
  push | end) push_branch="$(session_branch)"; push ;;
  *) warn "usage: memory-sync.sh pull|push|end" ;;
esac
exit 0
