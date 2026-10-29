#!/usr/bin/env bash
# Scan Markdown under docs/ (override with DOC_SCAN_ROOTS) for dead relative links.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"

ROOTS=(docs)
if [[ -n "${DOC_SCAN_ROOTS:-}" ]]; then
  IFS=':' read -r -a ROOTS <<< "$DOC_SCAN_ROOTS"
fi

extract_targets() {
  perl -nle 'print $1 while /\[[^\]]+\]\(([^)]+)\)/g' "$1" | sort -u
}

ERR=0
for root in "${ROOTS[@]}"; do
  [[ -z "$root" ]] && continue
  base="$REPO_ROOT/$root"
  [[ -d "$base" ]] || continue
  while IFS= read -r -d '' f; do
    dir="$(dirname "$f")"
    while IFS= read -r tgt; do
      [[ "$tgt" =~ ^https?:// ]] && continue
      [[ "$tgt" =~ ^mailto: ]] && continue
      [[ "$tgt" =~ ^# ]] && continue
      clean="${tgt%%#*}"
      [[ -z "$clean" ]] && continue
      resolved="$dir/$clean"
      if [[ ! -e "$resolved" ]]; then
        echo "check-dead-paths [ERROR]: $f -> $tgt (missing)" >&2
        ERR=$((ERR + 1))
      fi
    done < <(extract_targets "$f")
  done < <(find "$base" -type f -name '*.md' -print0 2>/dev/null)
done

if [[ $ERR -gt 0 ]]; then
  echo "check-dead-paths: FAILED ($ERR)"
  exit 1
fi
echo "check-dead-paths: PASS"
