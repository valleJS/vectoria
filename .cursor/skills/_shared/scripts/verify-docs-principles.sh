#!/usr/bin/env bash
# MOC / principle checks: ensure MOC hubs link to existing targets (token-efficient navigation).
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
PROFILE="${DOC_PROFILE:-$REPO_ROOT/.cursor/agent-profile.json}"

MOC_PATHS=()
if [[ -n "${DOC_MOC_PATHS:-}" ]]; then
  IFS=':' read -r -a MOC_PATHS <<< "$DOC_MOC_PATHS"
fi
if [[ -f "$PROFILE" ]] && command -v jq >/dev/null 2>&1; then
  while IFS= read -r line; do MOC_PATHS+=("$line"); done < <(jq -r '.documentation.mocPaths[]? // empty' "$PROFILE" 2>/dev/null || true)
fi
if [[ ${#MOC_PATHS[@]} -eq 0 ]]; then
  echo "verify-docs-principles: no MOC paths (set DOC_MOC_PATHS or documentation.mocPaths); skip."
  exit 0
fi

extract_targets() {
  perl -nle 'print $1 while /\[[^\]]+\]\(([^)]+)\)/g' "$1" | sort -u
}

ERR=0
for rel in "${MOC_PATHS[@]}"; do
  [[ -z "$rel" ]] && continue
  f="$REPO_ROOT/$rel"
  if [[ ! -f "$f" ]]; then
    echo "verify-docs-principles [ERROR]: MOC file missing: $rel" >&2
    ERR=$((ERR + 1))
    continue
  fi
  dir="$(dirname "$f")"
  while IFS= read -r tgt; do
    [[ "$tgt" =~ ^https?:// ]] && continue
    [[ "$tgt" =~ ^mailto: ]] && continue
    [[ "$tgt" =~ ^# ]] && continue
    clean="${tgt%%#*}"
    [[ -z "$clean" ]] && continue
    resolved="$dir/$clean"
    if [[ ! -e "$resolved" ]]; then
      echo "verify-docs-principles [ERROR]: $rel broken link target: $tgt" >&2
      ERR=$((ERR + 1))
    fi
  done < <(extract_targets "$f")
done

if [[ $ERR -gt 0 ]]; then
  echo "verify-docs-principles: FAILED ($ERR)"
  exit 1
fi
echo "verify-docs-principles: PASS"
