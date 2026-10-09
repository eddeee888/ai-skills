#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
sync="$root/cops/hooks/memory-sync.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/cops-memory-test.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/home" "$tmp/xdg"
export HOME="$tmp/home"
export XDG_CONFIG_HOME="$tmp/xdg"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_NOSYSTEM=1

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file() {
  [ -f "$1" ] || fail "missing file $1"
}

assert_contains() {
  grep -qF -- "$2" "$1" || fail "$1 does not contain: $2"
}

assert_absent() {
  [ ! -e "$1" ] || fail "unexpected path $1"
}

claude="$tmp/claude"
local_store="$tmp/local"
mkdir -p "$claude/agent-memory/memory/users/alice" "$claude/agent-memory/memory/team"
printf '## Everywhere\n- Keep personal rule\n' > "$claude/agent-memory/memory/users/alice/MEMORY.md"
printf '## Everywhere\n- Keep team rule\n' > "$claude/agent-memory/memory/team/MEMORY.md"

CLAUDE_CONFIG_DIR="$claude" PR_MEMORY_DIR="$local_store" PR_MEMORY_LOGIN=alice PR_MEMORY_REPO= \
  "$sync" pull
assert_contains "$local_store/memory/users/alice/MEMORY.md" "- Keep personal rule"
assert_contains "$local_store/memory/team/MEMORY.md" "- Keep team rule"
assert_contains "$claude/agent-memory/memory/users/alice/MEMORY.md" "- Keep personal rule"
assert_file "$local_store/.cops-legacy-import-v1"

inferred_claude="$tmp/inferred-claude"
inferred_store="$tmp/inferred-store"
mkdir -p "$inferred_claude/agent-memory/memory/users/alice"
printf '## Everywhere\n- Infer this login\n' > "$inferred_claude/agent-memory/memory/users/alice/MEMORY.md"
CLAUDE_CONFIG_DIR="$inferred_claude" PR_MEMORY_DIR="$inferred_store" PR_MEMORY_LOGIN= PR_MEMORY_REPO= \
  "$sync" pull
assert_contains "$inferred_store/memory/users/alice/MEMORY.md" "- Infer this login"
assert_file "$inferred_store/.cops-legacy-import-v1"

stub_claude="$tmp/stub-claude"
stub_store="$tmp/stub-store"
mkdir -p "$stub_claude/agent-memory/cops-pr-oracle"
cat > "$stub_claude/agent-memory/cops-pr-oracle/MEMORY.md" <<'EOF'
# Index

Rules live under `memory/`, not in this file. Read `memory/users/<github-login>/MEMORY.md` and `memory/team/MEMORY.md`.
- Prefer focused tests
EOF
CLAUDE_CONFIG_DIR="$stub_claude" PR_MEMORY_DIR="$stub_store" PR_MEMORY_LOGIN=alice PR_MEMORY_REPO= \
  "$sync" pull
assert_contains "$stub_store/memory/users/alice/candidates.md" "- Prefer focused tests  (legacy cops-pr-oracle/MEMORY.md)"
assert_absent "$stub_store/memory/users/alice/MEMORY.md"
assert_contains "$stub_claude/agent-memory/cops-pr-oracle/MEMORY.md" "- Prefer focused tests"
assert_file "$stub_store/.cops-legacy-import-v1"

empty_claude="$tmp/empty-claude"
empty_store="$tmp/empty-store"
mkdir -p "$empty_claude"
CLAUDE_CONFIG_DIR="$empty_claude" PR_MEMORY_DIR="$empty_store" PR_MEMORY_LOGIN=alice PR_MEMORY_REPO= \
  "$sync" pull
assert_absent "$empty_store/.cops-legacy-import-v1"

remote="$tmp/remote.git"
seed="$tmp/seed"
git init -q --bare "$remote"
git init -q -b main "$seed"
mkdir -p "$seed/memory/team"
printf '## Everywhere\n- Remote team rule\n' > "$seed/memory/team/MEMORY.md"
git -C "$seed" add memory
git -C "$seed" -c user.name=test -c user.email=test@example.com commit -qm seed
git -C "$seed" remote add origin "file://$remote"
git -C "$seed" push -q origin main
git --git-dir="$remote" symbolic-ref HEAD refs/heads/main

sync_store="$tmp/sync-store"
mkdir -p "$sync_store/memory/users/alice"
printf '## Everywhere\n- Local personal rule\n' > "$sync_store/memory/users/alice/MEMORY.md"
printf 'backup sentinel\n' > "$sync_store/unrelated-before-clone"
CLAUDE_CONFIG_DIR="$empty_claude" PR_MEMORY_DIR="$sync_store" PR_MEMORY_LOGIN=alice PR_MEMORY_REPO="file://$remote" \
  "$sync" pull
backup="$(printf '%s\n' "$tmp"/sync-store.bak-* | sort | tail -n 1)"
assert_file "$backup/unrelated-before-clone"
assert_contains "$backup/memory/users/alice/MEMORY.md" "- Local personal rule"

mkdir -p "$sync_store/memory/users/alice" "$sync_store/memory/users/bob" "$sync_store/memory/team"
printf '%s\n' '- Current user push' >> "$sync_store/memory/users/alice/MEMORY.md"
printf '%s\n' '- Current team push' >> "$sync_store/memory/team/MEMORY.md"
printf '%s\n' '- Other user must stay local' > "$sync_store/memory/users/bob/MEMORY.md"
printf '%s\n' 'unrelated must stay local' > "$sync_store/unrelated"
CLAUDE_CONFIG_DIR="$empty_claude" PR_MEMORY_DIR="$sync_store" PR_MEMORY_LOGIN=alice PR_MEMORY_REPO="file://$remote" \
  "$sync" push

git --git-dir="$remote" show memory/alice:memory/users/alice/MEMORY.md | grep -qF -- "- Current user push" ||
  fail "current user memory was not pushed"
git --git-dir="$remote" show memory/alice:memory/team/MEMORY.md | grep -qF -- "- Current team push" ||
  fail "team memory was not pushed"
git --git-dir="$remote" cat-file -e memory/alice:memory/users/bob/MEMORY.md 2>/dev/null &&
  fail "another user's tree was pushed"
git --git-dir="$remote" cat-file -e memory/alice:unrelated 2>/dev/null &&
  fail "unrelated file was pushed"

echo "memory-sync tests passed"
