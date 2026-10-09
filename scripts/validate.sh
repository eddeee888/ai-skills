#!/usr/bin/env bash
# Validate repository instruction contracts without Python.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
errors=()
review_workflow_words=0
review_workflow_limit=1800

# Accumulate an error while keeping all checks running.
fail() {
  local path="$1" message="$2"
  path="${path#"$ROOT"/}"
  errors[${#errors[@]}]="$path: $message"
}

# Count whitespace-delimited instruction words.
word_count() {
  wc -w < "$1" | tr -d ' '
}

# Enforce one file's word budget.
check_budget() {
  local path="$ROOT/$1" limit="$2" label="$3" count
  count="$(word_count "$path")"
  [ "$count" -le "$limit" ] ||
    fail "$path" "$label is $count words; limit is $limit"
}

# List matching repository files as NUL-delimited paths.
repository_files() {
  find "$ROOT" -type f -name "$1" ! -path '*/.git/*' -print0
}

# Parse every JSON file with jq.
validate_json() {
  if ! command -v jq >/dev/null 2>&1; then
    fail "JSON validation" "jq is required"
    return
  fi
  while IFS= read -r -d '' path; do
    detail="$(jq empty "$path" 2>&1)" ||
      fail "$path" "invalid JSON: $detail"
  done < <(repository_files '*.json')
}

# Check every shell script without executing it.
validate_shell() {
  while IFS= read -r -d '' path; do
    detail="$(bash -n "$path" 2>&1)" ||
      fail "$path" "bash -n failed: $detail"
  done < <(repository_files '*.sh')
}

# Keep shared convention copies identical across plugins.
validate_convention_copies() {
  local root_copy plugin plugin_copy
  for root_copy in "$ROOT"/CONVENTIONS*.md; do
    [ -f "$root_copy" ] || continue
    for plugin in cops oss; do
      plugin_copy="$ROOT/$plugin/${root_copy##*/}"
      if [ ! -e "$plugin_copy" ]; then
        fail "$plugin_copy" "missing copy of ${root_copy##*/}"
      elif ! cmp -s "$root_copy" "$plugin_copy"; then
        fail "$plugin_copy" "must be byte-identical to root ${root_copy##*/}"
      fi
    done
  done
}

# Decode percent-encoded Markdown link components.
url_decode() {
  local value="${1//+/ }"
  printf '%b' "${value//%/\\x}"
}

# Check a Markdown file for one GitHub-style heading anchor.
markdown_anchor_exists() {
  local path="$1" wanted="$2"
  perl -CS -Mutf8 -e '
    my ($file, $wanted) = @ARGV;
    open my $fh, "<:encoding(UTF-8)", $file or exit 1;
    while (<$fh>) {
      next unless /^#{1,6}\s+(.+?)\s*#*\s*$/;
      my $h = $1;
      $h =~ s/<[^>]+>//g;
      $h =~ s/\[([^\]]+)\]\([^)]+\)/$1/g;
      $h =~ s/[`*_~]//g;
      $h = lc $h;
      $h =~ s/[^\p{L}\p{N}_\s-]//g;
      $h =~ s/\s+/-/g;
      exit 0 if $h eq $wanted;
    }
    exit 1;
  ' "$path" "$wanted"
}

# Validate local Markdown targets, repository boundaries, and anchors.
validate_markdown_links() {
  local source raw target path_part fragment resolved
  while IFS= read -r -d '' source; do
    while IFS= read -r raw; do
      [ -n "$raw" ] || continue
      target="$raw"
      case "$target" in
        \<*\>*) target="${target#<}"; target="${target%%>*}" ;;
        *) target="$(printf '%s' "$target" | perl -pe 's/\s+["'\''].*$//')" ;;
      esac
      [ "$target" = "…" ] || [ "$target" = "..." ] && continue
      case "$target" in
        [A-Za-z][A-Za-z0-9+.-]*:* | //*) continue ;;
      esac
      fragment=""
      case "$target" in
        *#*) fragment="${target#*#}"; target="${target%%#*}" ;;
      esac
      path_part="${target%%\?*}"
      path_part="$(url_decode "$path_part")"
      fragment="$(url_decode "$fragment")"
      if [ -z "$path_part" ]; then
        resolved="$source"
      elif [ "${path_part#/}" != "$path_part" ]; then
        resolved="$ROOT/${path_part#/}"
      else
        resolved="$(dirname "$source")/$path_part"
      fi
      if [ ! -e "$resolved" ]; then
        fail "$source" "internal link does not resolve: $raw"
        continue
      fi
      resolved="$(realpath "$resolved")"
      case "$resolved" in
        "$ROOT" | "$ROOT"/*) ;;
        *) fail "$source" "internal link escapes repository: $raw"; continue ;;
      esac
      if [ -n "$fragment" ] && [ "${resolved##*.}" = md ]; then
        fragment="$(printf '%s' "$fragment" | tr '[:upper:]' '[:lower:]')"
        markdown_anchor_exists "$resolved" "$fragment" ||
          fail "$source" "link anchor '#${target#*#}' not found in ${resolved#"$ROOT"/}"
      fi
    done < <(
      perl -0777 -ne '
        while (/!?\[[^\]]*\]\(([^)\n]+)\)/g) { print "$1\n" }
      ' "$source"
    )
  done < <(repository_files '*.md')
}

# Match a human-readable convention section against normalized headings.
normalised_heading_exists() {
  local path="$1" wanted="$2"
  perl -CS -Mutf8 -e '
    my ($file, $wanted) = @ARGV;
    open my $fh, "<:encoding(UTF-8)", $file or exit 1;
    $wanted =~ s/\[([^\]]+)\]\([^)]+\)/$1/g;
    $wanted =~ s/[`*_~]//g;
    $wanted =~ s/\s+/ /g;
    $wanted = lc $wanted;
    while (<$fh>) {
      next unless /^#{1,6}\s+(.+?)\s*#*\s*$/;
      my $h = $1;
      $h =~ s/\[([^\]]+)\]\([^)]+\)/$1/g;
      $h =~ s/[`*_~]//g;
      $h =~ s/\s+/ /g;
      $h = lc $h;
      exit 0 if $h eq $wanted || index($h, "$wanted:") == 0 || index($h, "$wanted ") == 0;
    }
    exit 1;
  ' "$path" "$wanted"
}

# Validate all `CONVENTIONS*.md` section pointers.
validate_convention_pointers() {
  local source file section base target
  while IFS= read -r -d '' source; do
    while IFS=$'\t' read -r file section; do
      [ -n "$file" ] || continue
      case "${source#"$ROOT"/}" in
        cops/*) base="$ROOT/cops" ;;
        oss/*) base="$ROOT/oss" ;;
        *) base="$ROOT" ;;
      esac
      target="$base/$file"
      if [ ! -e "$target" ]; then
        fail "$source" "convention pointer targets missing ${target#"$ROOT"/}"
      elif ! normalised_heading_exists "$target" "$section"; then
        fail "$source" "convention pointer section \"$section\" not found in ${target#"$ROOT"/}"
      fi
    done < <(
      perl -CS -Mutf8 -0777 -ne '
        while (/`(CONVENTIONS[^`]*\.md)`\s*→\s*["“]([^"”]+)["”]/g) {
          print "$1\t$2\n";
        }
      ' "$source"
    )
  done < <(repository_files '*.md')
}

# Extract one single-line description from YAML frontmatter.
frontmatter_description() {
  awk '
    NR == 1 {
      if ($0 != "---") { print "ERROR:missing YAML frontmatter"; bad=1; exit }
      next
    }
    !closed && $0 == "---" { closed=1; next }
    !closed && /^description[[:space:]]*:/ {
      count++
      value=$0
      sub(/^[^:]*:[[:space:]]*/, "", value)
    }
    END {
      if (bad) {}
      else if (!closed) print "ERROR:YAML frontmatter is not closed with ---"
      else if (count != 1) print "ERROR:frontmatter must contain exactly one description"
      else print value
    }
  ' "$1"
}

# Validate one skill or agent frontmatter description.
validate_description_file() {
  local path="$1" value count first last
  value="$(frontmatter_description "$path")"
  case "$value" in
    ERROR:*) fail "$path" "${value#ERROR:}"; return ;;
  esac
  case "$value" in
    "" | "|" | ">" | "|-" | ">-")
      fail "$path" "frontmatter description must be present and single-line"
      return
      ;;
  esac
  first="${value%"${value#?}"}"
  last="${value#${value%?}}"
  if { [ "$first" = "'" ] || [ "$first" = '"' ]; } && [ "$last" != "$first" ]; then
    fail "$path" "frontmatter description quote must close on the same line"
    return
  fi
  count="$(printf '%s' "$value" | wc -w | tr -d ' ')"
  [ "$count" -le 60 ] ||
    fail "$path" "frontmatter description is $count words; limit is 60"
}

# Validate descriptions for all skills and direct agent definitions.
validate_descriptions() {
  local path
  while IFS= read -r -d '' path; do
    validate_description_file "$path"
  done < <(repository_files 'SKILL.md')
  while IFS= read -r -d '' path; do
    [ "$(basename "$(dirname "$path")")" = agents ] &&
      validate_description_file "$path"
  done < <(repository_files '*.md')
}

# Enforce general and normal-review instruction budgets.
validate_budgets() {
  local path filename count
  check_budget "CONVENTIONS.md" 500 "convention file"
  check_budget "CONVENTIONS-orchestration.md" 1200 "convention file"
  check_budget "CONVENTIONS-github.md" 600 "convention file"
  check_budget "CONVENTIONS-posts.md" 1000 "convention file"
  check_budget "CONVENTIONS-pr-metadata.md" 700 "convention file"

  while IFS= read -r -d '' path; do
    check_budget "${path#"$ROOT"/}" 1400 "SKILL.md"
  done < <(repository_files 'SKILL.md')
  for path in "$ROOT"/cops/agents/*.md; do
    [ -f "$path" ] && check_budget "${path#"$ROOT"/}" 1000 "agent instruction"
  done
  for plugin in cops oss; do
    while IFS= read -r -d '' path; do
      [ "${path##*/}" = SKILL.md ] ||
        check_budget "${path#"$ROOT"/}" 1200 "lazy instruction"
    done < <(find "$ROOT/$plugin/skills" -type f -name '*.md' -print0)
    if [ -d "$ROOT/$plugin/references" ]; then
      while IFS= read -r -d '' path; do
        check_budget "${path#"$ROOT"/}" 1200 "lazy instruction"
      done < <(find "$ROOT/$plugin/references" -type f -name '*.md' -print0)
    fi
  done

  review_files=(
    "cops/skills/pr-review/SKILL.md:350"
    "cops/skills/pr-review/post-review.md:220"
    "cops/agents/pr-oracle.md:400"
    "cops/references/pr-oracle/memory.md:220"
    "cops/references/pr-oracle/review-evidence.md:260"
    "cops/references/pr-oracle/modes/review-pr.md:420"
  )
  review_workflow_words=0
  for filename in "${review_files[@]}"; do
    limit="${filename##*:}"
    filename="${filename%:*}"
    check_budget "$filename" "$limit" "normal review instruction"
    count="$(word_count "$ROOT/$filename")"
    review_workflow_words=$((review_workflow_words + count))
  done
  [ "$review_workflow_words" -le "$review_workflow_limit" ] ||
    fail "normal review workflow" "instructions are $review_workflow_words words; limit is $review_workflow_limit"
}

# Require every literal marker for a behavioral contract.
require_markers() {
  local path="$1" contract="$2" marker missing=()
  shift 2
  for marker in "$@"; do
    grep -Fq -- "$marker" "$ROOT/$path" || missing[${#missing[@]}]="'$marker'"
  done
  [ "${#missing[@]}" = 0 ] ||
    fail "$path" "$contract contract marker(s) missing: $(IFS=', '; echo "${missing[*]}")"
}

# Reject obsolete or unsafe literal markers.
forbid_markers() {
  local path="$1" contract="$2" marker present=()
  shift 2
  for marker in "$@"; do
    grep -Fq -- "$marker" "$ROOT/$path" && present[${#present[@]}]="'$marker'"
  done
  [ "${#present[@]}" = 0 ] ||
    fail "$path" "$contract forbidden marker(s) present: $(IFS=', '; echo "${present[*]}")"
}

# Require literal markers to appear in workflow order.
require_order() {
  local path="$1" contract="$2" marker position previous=-1
  shift 2
  for marker in "$@"; do
    position="$(grep -Fbo -- "$marker" "$ROOT/$path" | awk -F: 'NR==1 {print $1}')"
    if [ -z "$position" ]; then
      fail "$path" "$contract order marker missing"
      return
    fi
    if [ "$position" -lt "$previous" ]; then
      fail "$path" "$contract markers are out of order"
      return
    fi
    previous="$position"
  done
}

# Check stale-head and pending-review posting sequences.
validate_review_dry_runs() {
  local path="cops/skills/pr-review/post-review.md"
  require_order "$path" "stale-head before gh write" \
    'Immediately before writing, re-read full `headRefOid`' 'gh api repos/'
  require_order "$path" "stale-head before MCP write" \
    'Immediately before writing, re-read full `headRefOid`' \
    '`pull_request_review_write` `create`'
  require_order "$path" "gh review JSON" '"commit_id"' '"event"' '"comments"'
  require_order "$path" "MCP pending review sequence" \
    '`pull_request_review_write` `create`' \
    '`add_comment_to_pending_review`' \
    '`pull_request_review_write` `submit_pending`'
  require_markers "$path" "pending failure preservation" \
    "pending review left:" "Never auto-delete/submit/replace." \
    "Delete only on explicit request"
}

# Guard high-value behavior that prose refactors must preserve.
validate_behavioral_contracts() {
  require_markers "cops/agents/pr-oracle.md" "eight modes" \
    '`scout-repo`' '`triage-threads`' '`brief-task`' '`sweep-diff`' \
    '`grill-description`' '`review-pr`' '`draft-author-notes`' '`learn-feedback`'
  require_markers "cops/agents/pr-oracle.md" "no-mode response" \
    'return exactly `no mode given`'
  require_markers "cops/agents/pr-oracle.md" "active mode reads" \
    'Read the active `<mode>.md` file(s)'
  require_markers "cops/agents/pr-oracle.md" "explicit-only learning" \
    '`learn-feedback` alone writes memory' "explicit intent"

  require_markers "cops/skills/pr-address/SKILL.md" "PR ownership" \
    'Compare `author.login` with the authenticated login'
  require_markers "cops/skills/pr-address/SKILL.md" "user decision gate" \
    "Apply no automatic action"
  require_markers "cops/skills/pr-address/SKILL.md" "never resolve" \
    "Never resolve a review thread."

  require_markers "cops/skills/pr-review/SKILL.md" "confirmation gate" \
    "Never post without confirmation."
  require_markers "cops/skills/pr-review/SKILL.md" "COMMENT default" \
    'the event is always `COMMENT`'
  require_markers "cops/skills/pr-review/SKILL.md" "head anchoring" \
    'Keep `headRefOid`'
  require_markers "cops/skills/pr-review/SKILL.md" "changed files brief" \
    ",files" 'equivalent `files` through the shared route contract' \
    "title/body, and changed files"
  require_markers "cops/skills/pr-review/SKILL.md" "review body confirmation" \
    "Body: <kind>:" 'non-empty `review_body`'
  require_markers "cops/skills/pr-review/SKILL.md" "unverified exclusion" \
    'Never post `unverified`; valid verified comments may continue.'
  require_markers "cops/skills/pr-review/SKILL.md" "reviewer fallback" \
    "Oracle unavailable but subagents exist" "No subagent capability"
  require_order "cops/skills/pr-review/SKILL.md" "review confirmation before posting" \
    "## 3. Confirm" "Never post without confirmation." "## 4. Post and report"

  require_markers "cops/references/pr-oracle/modes/review-pr.md" "review YAML" \
    "review_body:" "comments:" "dropped:" "unverified:"
  require_markers "cops/references/pr-oracle/review-evidence.md" "strict anchors" \
    "Anchors must be added/modified new-side lines" "Never relocate an invalid anchor"
  require_order "cops/skills/pr-note/SKILL.md" "note confirmation before posting" \
    "## 4. Confirm" "Never post without confirmation." "## 5. Post and report"

  require_markers "cops/references/pr-oracle/modes/draft-author-notes.md" "author note YAML" \
    "mode: draft-author-notes" "remove-instead:" "task source required"
  require_markers "cops/skills/pr-review/post-review.md" "headRefOid posting" \
    'saved `headRefOid`' '`COMMENT` by default'
  require_markers "cops/skills/pr-review/post-review.md" "strict rejection" \
    "Never relocate, fold, or silently drop invalid anchors."

  require_markers "cops/references/pr-oracle/memory.md" "workspace memory root" \
    "caller's \`memory-root\`" "configured workspace path"
  require_markers "cops/references/pr-oracle/memory.md" "no local fallback" \
    "fall back to a machine-local directory" "do not read or write memory" \
    "Never clone, pull, commit, or push the memory repository."
  require_markers "cops/references/pr-oracle/modes/learn-feedback.md" "explicit-only learning" \
    "explicit user intent" "Never treat running another mode" "remains inactive" \
    "not concrete:"
  require_markers "cops/references/pr-oracle/learning.md" "concrete rule definition" \
    "A rule is **concrete** when" "Never turn vague input into a rule"

  local path
  for path in cops/agents/pr-oracle.md cops/agents/pr-sidekick.md cops/README.md \
    cops/.claude-plugin/plugin.json cops/.cursor-plugin/plugin.json; do
    forbid_markers "$path" "local or synchronized memory" \
      "PR_MEMORY_DIR" "PR_MEMORY_REPO" "PLUGIN_OPTION_MEMORY" "memory-sync.sh" \
      "/.local/share/cops-memory" "~/.claude/agent-memory"
  done
  require_markers "cops/hooks/memory-context.sh" "read-only path validation" \
    "expand_path()" 'git -C "$configured" rev-parse --show-toplevel' \
    "COPS memory root:" "memory-root: unavailable"
  require_markers "cops/hooks/memory-context.sh" "unconfigured memory notice" \
    "COPS memory not configured:"
  require_markers "cops/agents/pr-oracle.md" "loaded files report" \
    '`loaded: <files actually read'
  for path in cops/references/pr-oracle/modes/review-pr.md \
    cops/references/pr-oracle/modes/draft-author-notes.md; do
    require_markers "$path" "loaded files report" "loaded:"
  done
  require_markers "CONVENTIONS-orchestration.md" "loaded files check" \
    "**Check what it loaded.**" "incomplete load"
  require_markers "cops/hooks/memory-context.sh" "explicit memory login" \
    'PR_MEMORY_LOGIN' "COPS memory login:" "memory-login: unset"
  forbid_markers "cops/hooks/memory-context.sh" "derived memory login" \
    "gh api user" "get_me" "git config"
  for path in cops/agents/pr-oracle.md cops/agents/pr-sidekick.md \
    cops/references/pr-oracle/memory.md; do
    require_markers "$path" "explicit memory login" "memory-login"
    forbid_markers "$path" "derived memory login" "mcp__github__get_me" "None → call \`get_me\`"
  done
  require_markers "cops/hooks/memory-context.sh" "no synchronization" \
    "COPS must not clone, pull, commit, or push it."
  forbid_markers "cops/hooks/memory-context.sh" "discovery or Git writes" \
    "workspace_roots" "remote get-url" "git clone" "git pull" \
    "git commit" "git push" "git add"

  require_markers "oss/skills/issue-verify/SKILL.md" "reproduction gate" \
    "This is a hard gate"
  require_markers "oss/skills/issue-verify/SKILL.md" "checkpoint" \
    "Skill: oss:issue-verify"
  require_markers "oss/skills/issue-verify/SKILL.md" "no PR sync" \
    'never runs `cops:pr-sync`'
  require_markers "oss/skills/issue-fix/SKILL.md" "option gate" \
    "This is a hard gate" "User hasn't picked an option"
  require_markers "oss/skills/issue-fix/SKILL.md" "checkpoint" \
    'issue-verify` checkpoint'
  require_markers "oss/skills/issue-fix/SKILL.md" "unnumbered checkpoint discovery" \
    "no-issue-number path"
  require_markers "oss/skills/issue-fix/SKILL.md" "no PR sync" \
    'never runs `cops:pr-sync`'
  require_markers "oss/skills/issue-fix/SKILL.md" "no duplicate PR" \
    'Never run `gh pr create`'
  require_markers "oss/skills/checkpoint.md" "exact issue guard" \
    "exact issue number" "#<issue-number>([^0-9]|$)"
  require_markers "oss/skills/checkpoint.md" "checkpoint sentinels" \
    '`CHECKPOINT_FOUND`' '`CHECKPOINT_NOT_FOUND`' '`CHECKPOINT_AMBIGUOUS`'
}

validate_json
validate_shell
validate_convention_copies
validate_markdown_links
validate_convention_pointers
validate_descriptions
validate_budgets
validate_behavioral_contracts
validate_review_dry_runs

if [ "${#errors[@]}" -ne 0 ]; then
  echo "Validation failed with ${#errors[@]} error(s):" >&2
  for error in "${errors[@]}"; do
    echo "- $error" >&2
  done
  exit 1
fi

echo "Validation passed: JSON, shell syntax, convention copies, Markdown links/pointers, frontmatter descriptions, word budgets, and behavioral contract markers. Normal review workflow: $review_workflow_words/$review_workflow_limit words."
