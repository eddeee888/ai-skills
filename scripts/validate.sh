#!/usr/bin/env bash
# Validate repository instruction contracts without Python.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
errors=()
budget_rows=()
review_workflow_words=0
review_workflow_limit=1800

# Accumulate an error while keeping all checks running.
fail() {
  local path="$1" message="$2"
  path="${path#"$ROOT"/}"
  errors[${#errors[@]}]="$path: $message"
}

# Count whitespace-delimited words of a file ("-" reads stdin), decoding UTF-8 so the
# count does not depend on the locale.
#   "naïve café — ok" → 4
word_count() {
  perl -CSD -ne '$n += () = /\S+/g; END { print $n + 0 }' "$1"
}

# Record one budget row (count, cap, headroom) and fail when the count is over the cap.
record_budget() {
  local name="$1" count="$2" limit="$3" label="$4"
  budget_rows[${#budget_rows[@]}]="$count"$'\t'"$limit"$'\t'"$((limit - count))"$'\t'"$name"
  [ "$count" -le "$limit" ] ||
    fail "$name" "$label is $count words; limit is $limit"
}

# Enforce one file's word budget.
check_budget() {
  local path="$ROOT/$1" limit="$2" label="$3"
  if [ ! -f "$path" ]; then
    fail "$path" "$label is budgeted but the file does not exist"
    return
  fi
  record_budget "$path" "$(word_count "$path")" "$limit" "$label"
}

# List matching repository files as NUL-delimited paths.
repository_files() {
  find "$ROOT" -type f -name "$1" ! -path '*/.git/*' ! -path '*/node_modules/*' -print0
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
        fail "$plugin_copy" "must be byte-identical to root ${root_copy##*/}; run bash scripts/sync-conventions.sh"
      fi
    done
  done
}

# Keep the HQ pane's handoff checklist in step with the orchestration convention:
# each cops skill's `Call points:` and `Required handoffs:` entries must be the
# labels of its EXPECTED_HANDOFFS in cops/hooks/orchestration.ts.
#   `cops:pr-start` (`scout-repo` + `brief-task`, `sweep-diff`) → scout-repo + brief-task, sweep-diff
#   `cops:pr-start` (fix loop)                                  → fix loop
validate_orchestration_handoffs() {
  local convention="$ROOT/cops/CONVENTIONS-orchestration.md"
  local hooks="$ROOT/cops/hooks/orchestration.ts" expected actual skill
  expected="$(perl -ne '
    next unless /^(Call points|Required handoffs): /;
    while (/`(cops:[\w-]+)` \(([^)]*)\)/g) {
      my $skill = $1;
      (my $labels = $2) =~ s/`//g;
      print "$skill\t$_\n" for split /,\s*/, $labels;
    }
  ' "$convention" | LC_ALL=C sort -u)"
  actual="$(perl -ne '
    $in = 1 if /^export const EXPECTED_HANDOFFS\b/;
    next unless $in;
    last if /^}/;
    $skill = $1 if /^\s*'\''(cops:[\w-]+)'\'': \[/;
    print "$skill\t$1\n" if /\blabel: '\''([^'\'']+)'\''/;
  ' "$hooks" | LC_ALL=C sort -u)"
  if [ -z "$expected" ] || [ -z "$actual" ]; then
    fail "$hooks" "no cops handoffs found to compare with ${convention#"$ROOT"/}"
    return
  fi
  while IFS= read -r skill; do
    [ -n "$skill" ] || continue
    fail "$hooks" "EXPECTED_HANDOFFS lacks ${skill/$'\t'/ } from ${convention#"$ROOT"/}"
  done < <(LC_ALL=C comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$actual"))
  while IFS= read -r skill; do
    [ -n "$skill" ] || continue
    fail "$hooks" "EXPECTED_HANDOFFS has ${skill/$'\t'/ }, absent from ${convention#"$ROOT"/}"
  done < <(LC_ALL=C comm -13 <(printf '%s\n' "$expected") <(printf '%s\n' "$actual"))
}

# Keep the HQ pane's autopilot strip in step with autopilot.md → "The chain": AUTOPILOT_STAGES must
# list its numbered `cops:` skills in order, and stage args must carry the `cops:stage:<name>` marker.
validate_autopilot_chain() {
  local doc="$ROOT/cops/skills/pr-start/autopilot.md" hooks="$ROOT/cops/hooks/autopilot-chain.ts" expected actual
  expected="$(perl -ne '
    $in = 1 if /^## The chain/;
    next unless $in;
    last if $in && /^## / && !/^## The chain/;
    print "$1\n" if /^\d+\. `(cops:[\w-]+)`/;
  ' "$doc")"
  actual="$(perl -ne '
    if (/^export const AUTOPILOT_STAGES = \[(.*)\]/) { print "$_\n" for $1 =~ /\x27(cops:[\w-]+)\x27/g }
  ' "$hooks")"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    fail "$hooks" "AUTOPILOT_STAGES must list ${expected//$'\n'/, } in order, as in ${doc#"$ROOT"/} → The chain; got: ${actual//$'\n'/, }"
  fi
  local names="${expected//cops:pr-/}"
  if ! grep -Fq "cops:stage:<${names//$'\n'/|}>" "$doc" || ! grep -Fq "match(/\\bcops:stage:" "$hooks"; then
    fail "$hooks" "stage args must carry the cops:stage:<name> marker, as in ${doc#"$ROOT"/} → The chain"
  fi
}

# Run the session-start hook and check its `COPS models:` line for each tier setting.
validate_memory_context_models() {
  local script="$ROOT/cops/hooks/memory-context.sh" out expected
  out="$(env -u COPS_MODEL_LIGHT -u COPS_MODEL_STANDARD -u COPS_MODEL_DEEP -u PR_MEMORY_PATH \
    -u CLAUDE_PLUGIN_OPTION_MEMORY_PATH bash "$script" claude 2>&1)"
  expected="COPS models: light=haiku standard=sonnet deep=opus"
  printf '%s\n' "$out" | grep -Fxq "$expected" ||
    fail "$script" "unset COPS_MODEL_* on Claude Code must print '$expected'; got: $out"
  out="$(env -u PR_MEMORY_PATH -u CLAUDE_PLUGIN_OPTION_MEMORY_PATH COPS_MODEL_LIGHT=inherit \
    COPS_MODEL_STANDARD='' COPS_MODEL_DEEP='b c' bash "$script" claude 2>&1)"
  expected="COPS models: light=inherit standard=sonnet deep=opus"
  printf '%s\n' "$out" | grep -Fxq "$expected" ||
    fail "$script" "set, empty, and invalid COPS_MODEL_* must print '$expected'; got: $out"
  out="$(env -u COPS_MODEL_LIGHT -u COPS_MODEL_STANDARD -u PR_MEMORY_PATH \
    -u CLAUDE_PLUGIN_OPTION_MEMORY_PATH COPS_MODEL_DEEP=d bash "$script" cursor 2>&1)"
  expected='light=inherit standard=inherit deep=d'
  printf '%s' "$out" | grep -Fq "$expected" && printf '%s' "$out" | jq -e .additional_context >/dev/null 2>&1 ||
    fail "$script" "cursor output must be JSON with '$expected'; got: $out"
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
  count="$(printf '%s' "$value" | word_count -)"
  record_budget "$path (description)" "$count" 60 "frontmatter description"
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
  local path filename count limit
  check_budget "CONVENTIONS.md" 500 "convention file"
  check_budget "CONVENTIONS-orchestration.md" 1464 "convention file"
  check_budget "CONVENTIONS-github.md" 600 "convention file"
  check_budget "CONVENTIONS-posts.md" 1000 "convention file"
  check_budget "CONVENTIONS-pr-metadata.md" 786 "convention file"
  check_budget "CONVENTIONS-evidence.md" 585 "convention file"
  check_budget "CONVENTIONS-verification.md" 312 "convention file"

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

  if [ -f "$ROOT/cops/skills/pr-start/autopilot.md" ]; then
    check_budget "cops/skills/pr-start/autopilot.md" 1200 "lazy instruction"
  else
    fail "cops/skills/pr-start/autopilot.md" "missing autopilot instruction file"
  fi

  review_files=(
    "cops/skills/pr-review/SKILL.md:410"
    "cops/skills/pr-review/post-review.md:220"
    "cops/agents/pr-oracle.md:405"
    "cops/references/pr-oracle/memory.md:233"
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
  record_budget "normal review workflow (sum)" "$review_workflow_words" "$review_workflow_limit" \
    "normal review workflow instructions"
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

# Every label line of the pr-start task card template starts with an emoji; its bullets and the
# closing prompt don't.
#   "🎯 Goal: <one line>"             → ok
#   "Goal: <one line>"                → fails
#   "- <what the change may touch>"   → skipped
validate_card_emoji() {
  local path="cops/skills/pr-start/SKILL.md" bad
  bad="$(perl -CSD -ne '
    $in = 1 if /^## 3\. Task card/;
    next unless $in;
    if (!$block && /^```text/) { $block = 1; next }
    next unless $block;
    last if /^```/;
    print unless /^- / || /^Confirm, or edit any line\.$/ || /^[^\x00-\x7F]\S* \S/;
  ' "$ROOT/$path")"
  [ -z "$bad" ] || fail "$path" "task card lines must start with an emoji: ${bad//$'\n'/; }"
  require_order "$path" "task card emoji labels" \
    "📋 Task card" "🎯 Goal:" "💡 Why:" "✅ Done when:" "🧐 Evidence:" "📦 In scope:" \
    "🚫 Out of scope:" "🛠️ Approach:" "📏 Size:" "🌿 Branch:" "🤖 Autopilot:" "Confirm, or edit any line."
}

# Guard the pr-start autopilot run: its gate, consent line, chain order and stops, and the
# exception each stage skill writes beside the rule that autopilot replaces.
validate_autopilot() {
  local start="cops/skills/pr-start/SKILL.md" auto="cops/skills/pr-start/autopilot.md" path
  [ -f "$ROOT/$auto" ] || return

  require_markers "$start" "autopilot flag" '`--autopilot [<login>]`'
  require_order "$start" "autopilot gate before the card" \
    "## 1. Gate" 'read [autopilot.md](autopilot.md) now' "## 2. Profile and brief"
  require_order "$start" "autopilot offer and consent on the card" \
    "## 3. Task card" "Read [size.md](size.md) now" \
    'read [autopilot.md](autopilot.md) before showing the card' "## 4. Fix loop"
  forbid_markers "$start" "size is advisory" "It gates only autopilot." "refuses autopilot"
  require_markers "$start" "autopilot line filled on every card" \
    'read [autopilot.md](autopilot.md) before showing the card, flag or not'
  forbid_markers "$start" "autopilot line filled on every card" \
    "Size Small or Medium, or the flag was typed"
  require_markers "$auto" "autopilot read before every card" "before showing any card"
  require_markers "$auto" "failed gate shows not offered" "Autopilot: not offered — <failed gate>\`"
  require_markers "$auto" "card edit keeps the Autopilot line" \
    "After an edit, show the card again with its notes updated."
  forbid_markers "$auto" "card edit keeps the Autopilot line" "show the card again without it"
  require_order "$start" "autopilot chain at wrap-up" \
    "## 7. Wrap up" "run autopilot.md's chain, finish and stops" "## Stop instead of proceeding"

  require_markers "$auto" "autopilot gate" \
    ".permissions.push" '`permissions.push` is `true`' 'The `autopilot` label is optional and never a gate' \
    "never create the label"
  require_markers "$auto" "autopilot bot login" "a bot token" "the card asks for the login"
  # Autopilot is offered on every card past the gate check; Size, high-risk scope and an
  # observable-behavior Done when only add an advisory note.
  require_order "$auto" "autopilot always offered, with advisory notes" \
    "## At the card" "the user's call" "the card shows no \`Autopilot:\` line unless a note applies" \
    "under \`🤖 Autopilot: advisory\`" "\`Large\` when the Size is Large" \
    "\`high-risk scope (<area>)\`" "\`Done when is an observable behavior\`" \
    "blocks nothing" "## Fix loop and sweep"
  forbid_markers "$auto" "no autopilot refusal at the card" \
    "Refuse autopilot" "Autopilot: refused" "refused — <reason>" "drops autopilot" \
    "Autopilot needs one that is a test or a command"
  require_markers "$auto" "autopilot consent line" \
    "Autopilot authorises: push, open PR, post review, push fixes, edit title and body, post notes, assign <login>" \
    "Confirm on autopilot" "The card is the only prompt."
  require_markers "$auto" "autopilot PR marking" "-f 'labels[]=autopilot'" \
    "Opened on autopilot by [Code Ops](https://github.com/eddeee888/ai-skills/tree/main/cops) plugin;" "- [ ] Approved by [<login>](https://github.com/<login>)"
  forbid_markers "$auto" "autopilot leaves the PR a draft" "assign <login>, mark ready" "draft: false"
  require_order "$auto" "autopilot chain order" \
    "## Open the PR" "## The chain" '1. `cops:pr-review`' '2. `cops:pr-address`' \
    '3. `cops:pr-wrap-up`' '4. `cops:pr-note`' "## Finish" "-f 'assignees[]=<login>'"
  require_markers "$auto" "autopilot address rules" \
    '`Question:` → left open for the user' '`Suggestion:` → applied if low risk' \
    '`Test:` → applied' '`Issue:` → applied if low risk, test first' "Left open if critical" \
    "beats the label" "Threads are never resolved."
  require_markers "$auto" "autopilot stops" \
    "A sidekick question stops the run." "A raised size is only reported." \
    "Only when all four stages finished" "Leave the PR a draft" 'without `Approved:`'
  forbid_markers "$auto" "a raised size stops nothing" "A size raised to Large"
  require_order "$auto" "stop report points to resume" \
    "## Stops" 'End with: `Say "resume the rest with autopilot"' "(resume.md)" "## Handoffs"

  # Resume: the user's own words or typed flag are the consent; never a second PR or fix loop on it.
  local resume="cops/skills/pr-start/resume.md"
  require_markers "$start" "resume trigger in the argument" \
    '`--autopilot resume [<PR URL>]`' "\"resume the rest with autopilot\"" \
    "[resume.md](resume.md), not Steps 1–3"
  require_markers "$resume" "resume consent" \
    "Only the user's own words in their own message" "\"resume the rest with autopilot\"" \
    '`/cops:pr-start --autopilot resume [<PR URL>]`' \
    "An agent, subagent, skill or inferred request never supplies it" \
    "That message is the consent: show no card." "Autopilot authorises: …"
  require_order "$resume" "resume paths" \
    "## In the same conversation" "The card confirmed earlier in this conversation stands." \
    "with the user's answer as \`Resuming:\`" "## In a new conversation" \
    "opened on autopilot (its body opens with a \`> [!NOTE]\` block starting \`Opened on autopilot by\`, or it has the \`autopilot\` label), and authored by the authenticated login" \
    "point to starting \`/cops:pr-start\` again" \
    "\`cops:pr-review\` is skipped when a review signed \`cops:pr-review\` exists" \
    "\`cops:pr-address\` and \`cops:pr-wrap-up\` always run" \
    "is still skipped when this run's \`cops:pr-review\` reports no findings" \
    "\`cops:pr-note\` is skipped when a review or comment signed \`cops:pr-note\` exists"
  require_markers "$start" "resume args when asked in words" "which you pass when the user says"
  require_markers "$start" "resume trigger in the description" "or to resume a stopped autopilot run"
  require_markers "$resume" "resume args when asked in words" \
    'call pr-start with args `--autopilot resume [<PR URL>]`' "the user's message is the consent, not the call's author"
  require_markers "$resume" "resume address rules" \
    "existing threads signed \`cops:pr-review\` count as this run's self-review threads"
  require_markers "$resume" "resume after note" \
    "A post signed \`cops:pr-note\` means address and wrap-up finished: run only Finish"
  require_markers "$resume" "resume after the attempt bound" "a fresh 3 attempts, and what failed from the stop report as \`Resuming:\`"
  require_markers "cops/skills/pr-start/fix-loop.md" "attempt bound on a resume" "a resume after a stop at the bound gets a fresh 3"
  require_markers "$resume" "resume never reopens" \
    "never opens a second PR and never runs the fix loop on a PR that already exists"

  require_markers "cops/skills/pr-start/size.md" "size is advisory" \
    "The size is advisory" "It gates nothing"
  forbid_markers "cops/skills/pr-start/size.md" "size is advisory" "refuses autopilot" "stops an autopilot run"
  require_markers "cops/skills/pr-start/fix-loop.md" "autopilot fix loop" \
    "In autopilot a question stops the run" "stops nothing, autopilot included"
  forbid_markers "cops/skills/pr-start/fix-loop.md" "autopilot fix loop" "Large stops the run"

  require_order "cops/skills/pr-review/SKILL.md" "autopilot review exception" \
    "Never post without confirmation." "Autopilot exception:" "## 4. Post and report"
  require_order "cops/skills/pr-note/SKILL.md" "autopilot note exception" \
    "Never post without confirmation." "Autopilot exception:" "## 5. Post and report"
  require_order "cops/skills/pr-address/SKILL.md" "autopilot address exception" \
    "Apply no automatic action" "Autopilot exception:" "## Step 5: Handling comments"
  require_order "cops/skills/pr-wrap-up/SKILL.md" "autopilot wrap-up exception" \
    'Don'\''t run `cops:pr-note`' "Autopilot exception:" "## When to touch nothing"
  for path in cops/skills/pr-review/SKILL.md cops/skills/pr-note/SKILL.md \
    cops/skills/pr-address/SKILL.md cops/skills/pr-wrap-up/SKILL.md; do
    require_markers "$path" "autopilot stage of a pr-start run the user started or resumed" \
      'as a stage of a `/cops:pr-start` autopilot run the user started or resumed' \
      "(../pr-start/autopilot.md)"
  done
  for path in cops/skills/pr-review/SKILL.md cops/skills/pr-note/SKILL.md \
    cops/skills/pr-address/SKILL.md; do
    require_markers "$path" "autopilot never started by an argument" \
      "never because an argument says so" 'without `Approved:`'
  done
  require_markers "cops/skills/pr-address/classify.md" "autopilot label rules" \
    "## Autopilot runs" "the risk gate above still beats everything here" \
    "the agent never answers its own question" "fixed test first"
  require_markers "cops/skills/pr-address/implement.md" "autopilot implementation" \
    "## Autopilot runs" "An Issue: thread is fixed test first" \
    "A skipped thread gets no reply and stays open"
  require_markers "cops/skills/pr-review/fix-no-post.md" "question and issue findings" \
    "## Questions first" "The sidekick never answers a question itself" \
    "An Issue: is fixed test first" "needs no second prompt"
  forbid_markers "cops/skills/pr-review/fix-no-post.md" "sidekick-answered question" \
    "answer a Question: by changing the code"

  require_markers "CONVENTIONS-orchestration.md" "autopilot exception" \
    "## Autopilot runs" 'never runs another skill to finish, except under "Autopilot runs"' \
    "**Nothing is asked mid-run.**" "**Only that run starts a stage.**" \
    "the user's own \"resume the rest with autopilot\" continues it"
  require_markers "CONVENTIONS-posts.md" "autopilot signature" \
    'for every post of an autopilot run (`CONVENTIONS-orchestration.md` → "Autopilot runs")'
  require_markers "CONVENTIONS-orchestration.md" "foreground by default" \
    '**Foreground by default.**'
  # The stages keep their own handoffs, so pr-start's lists are the fix loop and its two oracle calls.
  require_markers "CONVENTIONS-orchestration.md" "pr-start handoff list" \
    '`cops:pr-start` (fix loop);' \
    '`cops:pr-start` (`scout-repo` + `brief-task`, `sweep-diff`);'
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
    "/files --jq" '`pull_request_read` `get` and `get_files`' \
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

  for path in cops/skills/pr-review/SKILL.md cops/skills/pr-note/SKILL.md \
    cops/skills/pr-address/SKILL.md cops/skills/pr-start/SKILL.md \
    oss/skills/issue-fix/SKILL.md oss/skills/issue-create/SKILL.md \
    oss/skills/issue-verify/SKILL.md oss/skills/issue-analyze/SKILL.md; do
    require_markers "$path" "one question per item" \
      '`CONVENTIONS-posts.md` → "Approving drafts: one question per item"'
  done

  require_order "docs/memory-flow.html" "COPS skills in PR lifecycle order" \
    ">pr-start<" ">pr-review<" ">pr-wrap-up<" ">pr-note<" ">pr-address<"
  require_order "cops/README.md" "COPS skills in PR lifecycle order" \
    '| [`pr-start`]' '| [`pr-review`]' '| [`pr-wrap-up`]' '| [`pr-note`]' '| [`pr-address`]'

  require_markers "cops/skills/pr-start/SKILL.md" "model-invocable skill, user-typed autopilot, repeat-task ask" \
    "honor it only when the user typed it" "already ran \`pr-start\` for the same task"
  forbid_markers "cops/skills/pr-start/SKILL.md" "model-invocable skill" \
    "disable-model-invocation: true"
  require_order "cops/skills/pr-start/SKILL.md" "task card before any edit" \
    "## 3. Task card" "Nothing is edited, run or delegated before the user confirms the card." \
    "## 4. Fix loop"
  require_order "cops/skills/pr-start/SKILL.md" "sweep-diff before push" \
    "## 5. Sweep" 'Nothing is pushed before a clean `sweep-diff`' "git push"

  require_order "cops/skills/pr-start/SKILL.md" "task card Size line" \
    "- <one change per bullet, at most 3>" "Size: <Small|Medium|Large>" "- <reason>" \
    "Confirm, or edit any line."
  for path in cops/skills/pr-start/SKILL.md cops/skills/pr-start/size.md \
    oss/skills/issue-analyze/size-bug.md oss/skills/issue-analyze/size-feature.md; do
    require_markers "$path" "shared task size" \
      '`CONVENTIONS-pr-metadata.md` → "Task size"'
  done
  require_markers "cops/skills/pr-start/size.md" "size reason is a bullet under the Size line" \
    'with `- touches the shared retry helper and two packages` as the bullet under it' \
    '`📏 Size: Large` with `- sized Medium in the issue analysis;'
  forbid_markers "cops/skills/pr-start/size.md" "size reason is a bullet under the Size line" \
    '`Size: Large — sized Medium' 'over `- touches'
  require_markers "cops/skills/pr-start/fix-loop.md" "size raised after the loop" \
    'blast radius: <what>' 'Size: <card size> → <new size>'
  require_order "cops/skills/pr-start/SKILL.md" "task card Autopilot line" \
    "Size: <Small|Medium|Large>" \
    "Autopilot: <not offered — <failed gate> | advisory>" "- <advisory note, per autopilot.md>" \
    "Confirm, or edit any line."
  validate_card_emoji
  require_order "cops/skills/pr-start/SKILL.md" "ordered autopilot checklist before the card" \
    "Before showing the card:" "Read [size.md](size.md) now" "flag or not" \
    "Goal: <one line>"
  require_markers "cops/skills/pr-start/SKILL.md" "task card always shows the Branch line" \
    "🌿 Branch: <current branch | new <type>/<short-slug> from <default branch>>" \
    "- **Branch** → always shown"
  forbid_markers "cops/skills/pr-start/SKILL.md" "task card always shows the Branch line" \
    "only on a new branch" "the current branch is not shown"
  require_markers "cops/skills/pr-start/open-pr.md" "raised size reported at wrap-up" \
    "a raised Size"

  require_markers "CONVENTIONS-evidence.md" "evidence contract" \
    '`captured`' '`captured-by-user`' '`drawn`' '`mock`' '`manual`' '`not-captured`' \
    '"touches"' '$(git rev-parse --git-dir)/cops/evidence/<slug>/' \
    '## Evidence manifest: `<slug>/manifest.json`' 'the branch name with `/` replaced by `-`' \
    "Never the working tree or the PR branch" \
    '## Staleness is not a `sweep-diff` check' \
    "under \`### Before\` and \`### After\`"
  forbid_markers "CONVENTIONS-evidence.md" "evidence is rendered" "until then the task card is the record"
  require_markers "CONVENTIONS-verification.md" "verification contract" \
    "**Verification is proof**" "**Before/After is demonstration**" \
    "## Verification checklist: name the test type, not the command" \
    "## Don't checklist an intentionally-failing check as done" \
    '## Before and After: `### Before` / `### After` under `## Verification`' \
    '`### Before` then `### After` as two separate subsections under `## Verification`' \
    '**<name>** — <status> @ <sha>' "pending: drop <name>.png here" \
    "collapsed \`<details>\` evidence manifest" "keeps all of it verbatim"
  forbid_markers "cops/skills/pr-start/SKILL.md" "Before/After rules live in the convention" \
    "same names and order"
  forbid_markers "cops/skills/pr-start/open-pr.md" "Before/After rules live in the convention" \
    "same names and order"
  require_markers "cops/skills/pr-start/open-pr.md" "Before/After pointer" \
    '`CONVENTIONS-verification.md` → "Before and After"'
  require_markers "cops/skills/pr-wrap-up/draft.md" "keep Before/After and manifest" \
    "Keep existing \`### Before\` / \`### After\`" "evidence manifest verbatim" \
    '`CONVENTIONS-verification.md` → "Before and After"'
  require_order "CONVENTIONS-verification.md" "Done when clause under Before and After" \
    '## Before and After: `### Before` / `### After` under `## Verification`' \
    "never satisfies a card's Done when"
  for path in CONVENTIONS-pr-metadata.md CONVENTIONS-evidence.md; do
    forbid_markers "$path" "verification rules live in CONVENTIONS-verification.md" \
      "## Verification checklist" "## Don't checklist an intentionally-failing" "## Before and After"
  done
  require_markers "cops/skills/pr-wrap-up/draft.md" "verification pointer" \
    '`CONVENTIONS-verification.md` → "Verification checklist"'
  require_markers "cops/references/pr-oracle/modes/scout-repo.md" "evidence profile line" \
    "evidence: none | <kind> → <tool> (<command>), …; deploy → <command>" \
    "never guessed" "Never capture anything"
  require_markers "cops/references/pr-oracle/modes/brief-task.md" "evidence suggestion" \
    "Evidence: <kind> — <scenario>, <scenario> (before/after)" "a candidate list only" \
    "and optionally \`for: pr-sidekick\` and \`for: task-card\`" "Only with \`for: task-card\`" \
    "always end with one \`Evidence:\` line" "or no tooling in the profile: return \`Evidence: none — <why>\`"
  forbid_markers "cops/references/pr-oracle/modes/brief-task.md" "Evidence line is always returned" \
    "omit the line only when" "Evidence:\` suggestion"
  require_markers "cops/skills/pr-start/SKILL.md" "card brief request" \
    "with \`for: pr-sidekick\` and \`for: task-card\`"
  require_order "cops/skills/pr-start/SKILL.md" "required task card Evidence line" \
    "Done when: <a test" "Evidence: <kind> | none — <why>" "- <scenario> (before/after)" \
    "In scope:" "**Evidence** (required)" "An edit stands; it doesn't re-run \`brief-task\`."
  forbid_markers "cops/skills/pr-start/SKILL.md" "Evidence line is required" \
    "**Evidence** (optional)" "omitted when the profile's" "nothing captures it"
  require_markers "cops/skills/pr-start/fix-loop.md" "capture handoff" \
    "## Capture handoff" "Write to
Scratch only" "At most 3 attempts per scenario" "\`not-captured — <reason>\`"
  forbid_markers "cops/skills/pr-start/fix-loop.md" "pr-start captures only the before" \
    "Phase:" "\`after\`"
  require_order "cops/skills/pr-start/fix-loop.md" "capture handoff before the size check" \
    "## Fix-loop handoff" "## Capture handoff" "## Size after the loop"
  require_markers "cops/skills/pr-start/open-pr.md" "after left to pr-wrap-up" \
    'pending: run /cops:pr-wrap-up' "suggest \`/cops:pr-wrap-up\`"
  require_markers "cops/skills/pr-start/SKILL.md" "manifest step" \
    "## 5b. Write the evidence manifest" "Write the \`<details>\` manifest block"
  require_markers "cops/skills/pr-start/open-pr.md" "manifest step" \
    "\`### Before\` then \`### After\` under it" "evidence never holds the PR"
  require_markers "cops/skills/pr-start/SKILL.md" "open-pr.md is read at Step 6" \
    "Read [open-pr.md](open-pr.md) now"
  for path in cops/skills/pr-start/SKILL.md cops/skills/pr-start/open-pr.md; do
    forbid_markers "$path" "nothing is published to a branch" \
      "publish scratch" "worktree" "not published"
  done
  require_order "cops/skills/pr-start/SKILL.md" "manifest after sweep, before the push" \
    "## 5. Sweep" "## 5b. Write the evidence manifest" "## 6. Push and open the PR"
  require_order "cops/skills/pr-start/open-pr.md" "before and after under the body" \
    "## 6. Push and open the PR" "\`### Before\` then \`### After\`"
  for path in cops/skills/pr-start/SKILL.md cops/skills/pr-start/open-pr.md \
    cops/skills/pr-start/fix-loop.md CONVENTIONS-evidence.md; do
    forbid_markers "$path" "no evidence branch" "cops-evidence"
  done
  require_markers "cops/skills/pr-start/fix-loop.md" "evidence folder is the branch slug" \
    "cops/evidence/<slug>/"
  for path in CONVENTIONS-evidence.md cops/CONVENTIONS-evidence.md oss/CONVENTIONS-evidence.md; do
    require_markers "$path" "local-only captures" "no real credentials" "else \`manual\`"
    require_markers "$path" "manifest written by the main chat" \
      "Step 5b" "capture handoffs" "pending: drop <name>.png here" "\`captured-by-user\`"
    require_markers "$path" "secret backstop" \
      "\`Authorization\`" "private-key" "\`path:line\`" "possible secret" "backstop, not a guarantee"
  done
  for path in CONVENTIONS-verification.md cops/CONVENTIONS-verification.md oss/CONVENTIONS-verification.md; do
    require_markers "$path" "manual block" \
      "manual: <scenario>" "\`Needs:\`" "\`Expect:\`" "never runs it" "no tooling"
  done
  for path in cops/skills/pr-start/SKILL.md cops/skills/pr-start/fix-loop.md; do
    require_markers "$path" "evidence rules pointer" '`CONVENTIONS-evidence.md`'
    forbid_markers "$path" "evidence rules live in the conventions" \
      "(evidence.md)" "[evidence.md]" '`evidence.md`'
  done
  for path in CONVENTIONS-evidence.md cops/CONVENTIONS-evidence.md oss/CONVENTIONS-evidence.md; do
    require_markers "$path" "manifest and drop rules" \
      "source of truth" "no real credentials" "dropped by the user"
  done
  forbid_markers "cops/skills/pr-start/fix-loop.md" "evidence folder is the branch slug" "<pr | branch-slug>"
  forbid_markers "cops/skills/pr-start/SKILL.md" "evidence folder is the branch slug" "under \`<pr>/\`"
  for path in CONVENTIONS-evidence.md cops/CONVENTIONS-evidence.md oss/CONVENTIONS-evidence.md; do
    require_markers "$path" "evidence line always present" "always carries the line (it is required)"
    forbid_markers "$path" "evidence line always present" "→ no line"
  done

  recapture="cops/skills/pr-wrap-up/recapture.md"
  for path in CONVENTIONS-evidence.md cops/CONVENTIONS-evidence.md oss/CONVENTIONS-evidence.md; do
    require_markers "$path" "stale before is labelled, not recaptured" \
      "never recaptured" 'stale since <new base sha>' "its status stays"
    require_markers "$path" "who captures what" \
      "pr-start" "before the first edit" "pr-wrap-up" "final code" "absent until"
    require_markers "$path" "hand-edited manifest" \
      "treated as no manifest" "skip recapture" "say so in the return line"
    require_markers "$path" "how guardrail" \
      "ONE invocation" "named \`package.json\` script" "\`evidence:\` line" "no shell operators" \
      "becomes \`manual\`" "never executed" "Never run \`how\` text" '"how": "pnpm test:e2e"'
    forbid_markers "$path" "how guardrail" '"how": "pnpm exec'
  done
  for path in CONVENTIONS-verification.md cops/CONVENTIONS-verification.md oss/CONVENTIONS-verification.md; do
    require_markers "$path" "stale entry labels" 'stale since <sha>' 'pending: drop <name>.png here' \
      'pending: run /cops:pr-wrap-up'
  done
  require_markers "$recapture" "deterministic stale check" \
    "no model call" "no oracle" "Capture the after" '`CONVENTIONS-evidence.md`'
  require_markers "$recapture" "labels live in the conventions" '`CONVENTIONS-verification.md`'
  forbid_markers "$recapture" "recapture rules live in the conventions" \
    "package.json script" "stale since" "treated as no manifest" 'git diff --quiet' "shell operators" "worktree"
  require_markers "$recapture" "manifest and entries updated" \
    '`CONVENTIONS-verification.md` → "Before and After"' '`captured-by-user`' "secret backstop"
  require_markers "$recapture" "recapture return item" 'evidence (n captured, n stale, n none)'
  require_markers "cops/skills/pr-wrap-up/SKILL.md" "stale-evidence check reads the body on any route" \
    "fetched in this step" 'MCP `pull_request_read` `get`' "evidence check was skipped"
  forbid_markers "cops/skills/pr-wrap-up/SKILL.md" "stale-evidence check reads the body on any route" \
    '`gh pr view --json body`'
  require_markers "cops/skills/pr-wrap-up/SKILL.md" "pr-wrap-up recapture pointer" \
    "no evidence to capture" "recapture.md" 'evidence (n captured, n stale, n none)'
  require_markers "cops/skills/pr-wrap-up/draft.md" "pr-wrap-up recapture pointer" \
    "recapture.md" "before Step 4"
  forbid_markers "cops/skills/pr-wrap-up/SKILL.md" "recapture rules live in recapture.md" \
    'stale since' 'git diff --quiet <after.at>' "package.json"
  forbid_markers "cops/skills/pr-wrap-up/draft.md" "recapture rules live in recapture.md" \
    'stale since' 'git diff --quiet <after.at>' "package.json" "Recapture is out of scope"
  forbid_markers "cops/skills/pr-address/SKILL.md" "pr-wrap-up owns stale evidence" "evidence stale"
  require_markers "cops/skills/pr-start/autopilot.md" "autopilot evidence report" \
    '`pending: drop`' '`stale`' '`manual`' '`not-captured`' "evidence never holds the finish step"

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
  for path in "$ROOT"/cops/skills/pr-start/*.md; do
    forbid_markers "${path#"$ROOT"/}" "self-contained cops skill" "oss:" "oss/" "/oss"
  done
  for path in cops/agents/pr-oracle.md cops/agents/pr-sidekick.md cops/README.md \
    cops/.claude-plugin/plugin.json cops/.cursor-plugin/plugin.json; do
    forbid_markers "$path" "local or synchronized memory" \
      "PR_MEMORY_DIR" "PR_MEMORY_REPO" "PLUGIN_OPTION_MEMORY" "memory-sync.sh" \
      "/.local/share/cops-memory" "~/.claude/agent-memory"
  done
  require_markers "cops/hooks/memory-context.sh" "read-only path validation" \
    "expand_path()" 'git -C "$configured" rev-parse --show-toplevel' \
    "COPS memory root:" "memory-root: unavailable"
  require_markers "CONVENTIONS-orchestration.md" "model tiers" \
    "**Model by tier.**" '`COPS models:`' '| `light` |' '| `standard` |' '| `deep` |'
  require_markers "cops/hooks/memory-context.sh" "model tiers" \
    "COPS_MODEL_LIGHT" "COPS_MODEL_STANDARD" "COPS_MODEL_DEEP" "COPS models:"
  require_markers "cops/hooks/memory-context.sh" "unconfigured memory notice" \
    "COPS memory not configured:"
  require_markers "cops/references/pr-oracle/github-access.md" "gh api oracle access" \
    'only through the `gh api` REST reads' "never MCP" '| Read | `gh api` read |' \
    'including `gh auth status`' "401/403/404" '`gh api unavailable — read it in the main chat`'
  require_markers "CONVENTIONS-github.md" "oracle sentinel handled by the main chat" \
    '`gh api unavailable — read it in the main chat`'
  require_markers "cops/skills/pr-address/SKILL.md" "oracle sentinel handled by the main chat" \
    '`gh api unavailable — read it in the main chat`'
  require_markers "cops/skills/pr-address/implement.md" "sidekick gets comment bodies on MCP" \
    'GitHub: none' 'its full comment body'
  require_markers "cops/skills/pr-wrap-up/SKILL.md" "sidekick gets the PR body on MCP" \
    'GitHub: none' 'PR body:'
  require_markers "cops/skills/pr-wrap-up/draft.md" "sidekick gets the PR body on MCP" \
    'PR body:'
  forbid_markers "cops/references/pr-oracle/github-access.md" "MCP-only oracle access" \
    'Do not use `gh`'
  for path in cops/agents/pr-oracle.md cops/agents/pr-sidekick.md; do
    forbid_markers "$path" "subagents never use MCP" "mcp__github__" "ToolSearch"
  done
  for path in cops/skills/pr-address/implement.md cops/skills/pr-start/fix-loop.md \
    cops/skills/pr-wrap-up/SKILL.md cops/skills/pr-review/fix-no-post.md; do
    forbid_markers "$path" "sidekick GitHub line is gh api or none" 'GitHub: <"gh' "GitHub: MCP"
  done
  for path in "$ROOT"/cops/skills/*/*.md "$ROOT"/oss/skills/*/*.md; do
    forbid_markers "${path#"$ROOT"/}" "skills read GitHub through gh api REST" "gh pr view"
  done
  for path in "$ROOT"/cops/skills/*/*.md; do
    forbid_markers "${path#"$ROOT"/}" "skills write GitHub through gh api REST" "gh pr create"
  done
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
  for path in cops/agents/pr-oracle.md cops/references/pr-oracle/memory.md; do
    require_markers "$path" "explicit memory login" "memory-login"
    forbid_markers "$path" "derived memory login" "mcp__github__get_me" "None → call \`get_me\`"
  done
  require_markers "cops/agents/pr-sidekick.md" "oracle-only memory" \
    "You never read or write memory."
  forbid_markers "cops/agents/pr-sidekick.md" "sidekick memory reads" \
    "memory-root" "memory-login" "MEMORY.md"
  forbid_markers "cops/hooks/memory-context.sh" "sidekick memory context" \
    "pr-oracle and pr-sidekick"
  for path in cops/references/pr-oracle/modes/brief-task.md \
    cops/references/pr-oracle/modes/triage-threads.md; do
    require_markers "$path" "editing-subagent rules" "caller can act on"
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
  require_markers "oss/skills/issue-verify/SKILL.md" "no PR wrap-up" \
    'never runs `cops:pr-wrap-up`'
  require_markers "oss/skills/issue-fix/SKILL.md" "option gate" \
    "This is a hard gate" "User hasn't picked an option"
  require_markers "oss/skills/issue-fix/SKILL.md" "checkpoint" \
    'issue-verify` checkpoint'
  require_markers "oss/skills/issue-fix/SKILL.md" "unnumbered checkpoint discovery" \
    "no-issue-number path"
  require_markers "oss/skills/issue-fix/SKILL.md" "no PR wrap-up" \
    'never runs `cops:pr-wrap-up`'
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
validate_orchestration_handoffs
validate_autopilot_chain
validate_memory_context_models
validate_markdown_links
validate_convention_pointers
validate_descriptions
validate_budgets
validate_behavioral_contracts
validate_autopilot
validate_review_dry_runs

# Print the count / cap / headroom table for every budgeted file.
printf '%7s %7s %9s  %s\n' count cap headroom file
printf '%s\n' "${budget_rows[@]}" | LC_ALL=C sort -u -t$'\t' -k3,3n -k4,4 |
  while IFS=$'\t' read -r count limit headroom name; do
    printf '%7s %7s %9s  %s\n' "$count" "$limit" "$headroom" "${name#"$ROOT"/}"
  done

if [ "${#errors[@]}" -ne 0 ]; then
  echo "Validation failed with ${#errors[@]} error(s):" >&2
  for error in "${errors[@]}"; do
    echo "- $error" >&2
  done
  exit 1
fi

echo "Validation passed: JSON, shell syntax, convention copies, orchestration handoffs, session-start model tiers, Markdown links/pointers, frontmatter descriptions, word budgets (table above), behavioral contract markers, and the autopilot contract. Normal review workflow: $review_workflow_words/$review_workflow_limit words."
