#!/usr/bin/env bash
# Lint a drafted PR body without a model. Usage: bash cops/scripts/lint-pr-body.sh <body file>
# Prints each failure as `path:line message` and exits 1 when there is any.

set -u

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo "usage: lint-pr-body.sh <body file>" >&2
  exit 2
fi

# Lines inside fenced code blocks are skipped by every check.
#   "## Why" twice                                  → "duplicate heading '## Why' (first at line 3)"
#   "> Opened on autopilot by ..." without the rest → "autopilot banner must be ..."
#   "Size: Big — x"                                 → "Size line must be ..."
#   "[`a/b` `f:1`](https://github.com/a/b/blob/main/f#L1)" → "code link must be ..."
#   "- **The whole bullet.**" under ## What          → "whole-sentence bold ..."
output="$(perl -CSD -Mutf8 -e '
  my $path = shift;
  open my $fh, "<:encoding(UTF-8)", $path or exit 2;
  chomp(my @lines = <$fh>);
  my (%seen, @out, $fence, $section);
  my $banner_note = qr/^> \[!NOTE\]$/;
  my $banner_by   = qr/^> Opened on autopilot by \[Code Ops\]\(https:\/\/github\.com\/eddeee888\/ai-skills\/tree\/main\/cops\) plugin;$/;
  my $banner_box  = qr/^> - \[[ x]\] Approved by \[([A-Za-z0-9-]+)\]\(https:\/\/github\.com\/([A-Za-z0-9-]+)\)$/;
  for my $i (0 .. $#lines) {
    my ($n, $l) = ($i + 1, $lines[$i]);
    if ($l =~ /^\s*(```|~~~)/) { $fence = !$fence; next }
    if ($fence) { next }

    if ($l =~ /^## (.+?)\s*$/) {
      $section = $1;
      if ($seen{$1}) {
        push @out, "$n duplicate heading \x27## $1\x27 (first at line $seen{$1})";
      }
      $seen{$1} ||= $n;
    }

    if ($l =~ /Opened on autopilot/) {
      my $ok = $i >= 1 && $lines[$i - 1] =~ $banner_note && $l =~ $banner_by
        && ($lines[$i + 1] // "") =~ $banner_box && $1 eq $2;
      if (!$ok) {
        push @out, "$n autopilot banner must be \x27> [!NOTE]\x27, the Code Ops line, then \x27> - [ ] Approved by [<login>](https://github.com/<login>)\x27 verbatim";
      }
    }

    if ($l =~ /^(?:[-*] )?Size:/ && $l !~ /^(?:[-*] )?Size: (?:Small|Medium|Large) \x{2014} \S/) {
      push @out, "$n Size line must be \x27Size: <Small|Medium|Large> \x{2014} <reason>\x27";
    }

    while ($l =~ /\[([^\]]*)\]\((https:\/\/github\.com\/[^)\s]*\/blob\/[^)\s]*)\)/g) {
      my ($text, $url) = ($1, $2);
      if ($url !~ m{^https://github\.com/([^/]+)/([^/]+)/blob/[0-9a-f]{40}/([^#]+)#L(\d+(?:-L\d+)?)$}) {
        push @out, "$n code link must be https://github.com/<owner>/<repo>/blob/<40-char sha>/<path>#L<line>: $url";
        next;
      }
      my $want = "`$1/$2` `$3:" . ($4 =~ s/-L/-/r) . "`";
      if ($text ne $want) {
        push @out, "$n code link text must be $want, got: $text";
      }
    }

    if (($section // "") =~ /^(?:Why|What|Verification)$/ && $l =~ /^\s*(?:[-*]|\d+\.) (?:\[[ x]\] )?(.*)$/) {
      my $body = $1;
      if ($body =~ /^\*\*[^*]+\*\*[.:]?$/ || $body =~ /^\*\*[^*]+[.!?]\*\*(?:\s|$)/) {
        push @out, "$n whole-sentence bold: bold only the critical claim, not the sentence";
      }
    }
  }
  print "$_\n" for @out;
' "$1")" || { echo "$1:0 cannot read the body file" >&2; exit 2; }

[ -z "$output" ] && exit 0
while IFS= read -r line; do
  printf '%s:%s\n' "$1" "$line"
done <<<"$output"
exit 1
