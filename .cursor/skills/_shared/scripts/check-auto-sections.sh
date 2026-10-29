#!/usr/bin/env bash
# Read agent-profile autoSections and report doc files that should contain section markers.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
PROFILE="${DOC_PROFILE:-$REPO_ROOT/.cursor/agent-profile.json}"

if [[ ! -f "$PROFILE" ]]; then
  echo "check-auto-sections: no profile at $PROFILE; nothing to do."
  exit 0
fi
command -v jq >/dev/null 2>&1 || { echo "check-auto-sections: jq required" >&2; exit 1; }

echo "check-auto-sections: profile=$PROFILE"
# Expected shape: { "agentProfile": { "autoSections": [ { "path": "docs/foo.md", "sections": ["## API", "## Deploy"] } ] } } }
# Also support top-level autoSections
mapfile -t ROWS < <(jq -c '.autoSections[]? // .agentProfile.autoSections[]? // empty' "$PROFILE" 2>/dev/null || true)

if [[ ${#ROWS[@]} -eq 0 ]]; then
  echo "check-auto-sections: no autoSections defined."
  exit 0
fi

ERR=0
for row in "${ROWS[@]}"; do
  [[ -z "$row" ]] && continue
  path=$(echo "$row" | jq -r '.path // empty')
  [[ -z "$path" ]] && continue
  file="$REPO_ROOT/$path"
  if [[ ! -f "$file" ]]; then
    echo "check-auto-sections [ERROR]: missing file $path" >&2
    ERR=$((ERR + 1))
    continue
  fi
  while IFS= read -r heading; do
    [[ -z "$heading" ]] && continue
    if ! grep -qF "$heading" "$file"; then
      echo "check-auto-sections [ERROR]: $path missing section marker: $heading" >&2
      ERR=$((ERR + 1))
    fi
  done < <(echo "$row" | jq -r '.sections[]? // empty')
done

[[ $ERR -eq 0 ]] && echo "check-auto-sections: OK" && exit 0
echo "check-auto-sections: $ERR issue(s)"
exit 1
