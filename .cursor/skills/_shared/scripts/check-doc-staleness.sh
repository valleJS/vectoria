#!/usr/bin/env bash
# check-doc-staleness.sh — READ-ONLY. Detect doc-to-code drift (self-healing loop, Phase I).
#
# Two modes:
#   (default) HISTORY — for each leaf with `sources:` + `sources_stamp:`, count commits on those
#             source paths since the stamp. Newer commits → STALE. Used by docs-defrag (step 6).
#   --staged          — for a pre-commit hook: a leaf is STALE if any of its `sources:` paths is
#             touched by the STAGED changes (`git diff --cached`). No stamp needed; the new commit
#             does not exist yet. Used by hooks/pre-commit-staleness.
#
# Prints one block per stale leaf:
#     STALE <leaf>
#       sources: <paths>
#       range:   <stamp>..HEAD            (history mode)
#       commits: <n>                      (history mode)
#       staged:  <matched source paths>   (staged mode)
# Leaves without `sources` are skipped silently (no false alarm). Exit 0 always (advisory, not a gate);
# the count of stale leaves is printed on the last line as `stale=<n>` for the caller.
set -euo pipefail

MODE="history"
if [[ "${1:-}" == "--staged" || "${STALENESS_MODE:-}" == "staged" ]]; then
  MODE="staged"
fi

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
cd "$REPO_ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "check-doc-staleness: not a git repo — staleness detection unavailable. stale=0"
  exit 0
fi

DOCS="${DOC_DOCS_DIR:-docs}"
if [[ ! -d "$DOCS" ]]; then
  echo "check-doc-staleness: no $DOCS/ directory. stale=0"
  exit 0
fi

# In staged mode, gather the staged paths once. A leaf is stale when one of its `sources` matches a
# staged path (exact file, or a staged path under a `sources` directory entry).
STAGED_PATHS=()
if [[ "$MODE" == "staged" ]]; then
  while IFS= read -r p; do
    [[ -n "$p" ]] && STAGED_PATHS+=("$p")
  done < <(git diff --cached --name-only 2>/dev/null || true)
fi

# Does any staged path match this leaf's sources? Echoes the matched source entries; empty = no match.
staged_match() {
  local matched=""
  local s p
  for s in "$@"; do
    s="${s%/}"                                  # normalise trailing slash on dir sources
    for p in "${STAGED_PATHS[@]:-}"; do
      [[ -z "$p" ]] && continue
      if [[ "$p" == "$s" || "$p" == "$s/"* ]]; then
        matched="${matched:+$matched }$s"
        break
      fi
    done
  done
  echo "$matched"
}

stale=0

# Pull `sources:` (inline list) and `sources_stamp:` from a file's frontmatter via python (robust).
read_fm() {
  FM_FILE="$1" python3 - <<'PY'
import os, re, sys
txt = open(os.environ["FM_FILE"], encoding="utf-8", errors="replace").read()
m = re.match(r"^---\n(.*?)\n---", txt, re.S)
if not m:
    sys.exit(0)
fm = m.group(1)
# Inline flow list (`sources: [a, b]`) or block list (`sources:` + `  - a` lines).
inline = re.search(r"^sources:[ \t]*\[([^\]]*)\]", fm, re.M)
block = re.search(r"^sources:[ \t]*\n((?:[ \t]+-[^\n]*(?:\n|$))+)", fm, re.M)
stamp = re.search(r"^sources_stamp:\s*(\S+)", fm, re.M)
if inline:
    items = inline.group(1).split(",")
elif block:
    items = [re.sub(r"^[ \t]+-[ \t]*", "", l) for l in block.group(1).splitlines()]
else:
    items = []
paths = [p.strip().strip("'\"") for p in items if p.strip().strip("'\"")]
if paths:
    print("SOURCES\t" + "\t".join(paths))
if stamp:
    print("STAMP\t" + stamp.group(1).strip())
PY
}

while IFS= read -r leaf; do
  rel="${leaf#"$REPO_ROOT"/}"
  out="$(read_fm "$leaf")"
  [[ "$out" == *"SOURCES"* ]] || continue          # no sources → skip silently

  sources=()
  stamp=""
  while IFS= read -r line; do
    case "$line" in
      SOURCES*) IFS=$'\t' read -r _ rest <<< "$line"; IFS=$'\t' read -r -a sources <<< "$rest" ;;
      STAMP*)   stamp="${line#STAMP$'\t'}" ;;
    esac
  done <<< "$out"

  # Staged mode: a leaf is stale if a staged path touches one of its sources. No stamp needed.
  if [[ "$MODE" == "staged" ]]; then
    hit="$(staged_match "${sources[@]}")"
    if [[ -n "$hit" ]]; then
      echo "STALE $rel"
      echo "  sources: ${sources[*]}"
      echo "  staged:  $hit"
      stale=$((stale + 1))
    fi
    continue
  fi

  if [[ -z "$stamp" ]]; then
    echo "STALE $rel"
    echo "  sources: ${sources[*]}"
    echo "  range:   (no sources_stamp — never verified against code)"
    stale=$((stale + 1))
    continue
  fi

  # Count commits touching any source path since the stamp.
  if ! git cat-file -e "$stamp^{commit}" 2>/dev/null; then
    echo "STALE $rel"
    echo "  sources: ${sources[*]}"
    echo "  range:   (sources_stamp '$stamp' not a known commit — re-stamp needed)"
    stale=$((stale + 1))
    continue
  fi
  n="$(git rev-list --count "$stamp"..HEAD -- "${sources[@]}" 2>/dev/null || echo 0)"
  if [[ "${n:-0}" -gt 0 ]]; then
    echo "STALE $rel"
    echo "  sources: ${sources[*]}"
    echo "  range:   ${stamp:0:9}..HEAD"
    echo "  commits: $n"
    stale=$((stale + 1))
  fi
done < <(find "$DOCS" -name '*.md' -not -name '_index.md' -not -path '*/.git/*' | sort)

echo "check-doc-staleness: stale=$stale"
