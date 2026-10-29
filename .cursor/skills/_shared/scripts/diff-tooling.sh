#!/usr/bin/env bash
# diff-tooling.sh — READ-ONLY. Three-way classify of vendored tooling files vs. a newer SSOT.
#
# For each managed file it prints one TSV line:
#     <relpath>\t<class>\t<status>
# where status is one of: same | upstream-changed | local-changed | both-changed | missing-local | new-upstream
#
# Inputs (resolved automatically, overridable by env):
#   SAT_SKILLS   satellite vendored dir   (default: <repo>/.cursor/skills)
#   SSOT_ROOT    checked-out SSOT repo    (default: realpath of ~/.claude/skills/docs-init's repo)
#   BASE_COMMIT  the commit recorded as vendored (default: ssot_commit from .tooling-version)
#
# The "base" version of each file is read from the SSOT git history at BASE_COMMIT, so we can tell
# a local edit (local != base) apart from an upstream change (upstream != base). No writes anywhere.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
SAT_SKILLS="${SAT_SKILLS:-$REPO_ROOT/.cursor/skills}"

realpath_portable() {
  python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1" 2>/dev/null \
    || readlink -f "$1" 2>/dev/null || echo "$1"
}

# Resolve the SSOT repo via the docs-init symlink unless told otherwise.
if [[ -z "${SSOT_ROOT:-}" ]]; then
  init_link="${CLAUDE_SKILLS:-$HOME/.claude/skills}/docs-init"
  if [[ -e "$init_link" ]]; then
    di="$(realpath_portable "$init_link")"           # .../polaris-docs/docs-init
    SSOT_ROOT="$(git -C "$di" rev-parse --show-toplevel 2>/dev/null || echo "")"
  fi
fi
if [[ -z "${SSOT_ROOT:-}" || ! -d "$SSOT_ROOT/.git" ]]; then
  echo "diff-tooling [ERROR]: cannot locate SSOT repo (set SSOT_ROOT)" >&2
  exit 2
fi

MANIFEST="$SSOT_ROOT/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "diff-tooling [ERROR]: no manifest.json at $MANIFEST" >&2; exit 2; }

TV="$SAT_SKILLS/.tooling-version"
BASE_COMMIT="${BASE_COMMIT:-}"
if [[ -z "$BASE_COMMIT" && -f "$TV" ]]; then
  BASE_COMMIT="$(awk -F= '/^ssot_commit=/{print $2}' "$TV")"
fi
[[ -n "$BASE_COMMIT" ]] || { echo "diff-tooling [ERROR]: no BASE_COMMIT / .tooling-version" >&2; exit 2; }

# Map a satellite-relative path to its SSOT source location. _shared/* lives under
# templates/_shared/* in the SSOT; <skill>/SKILL.md lives under templates/<skill>/skill.template.md.
ssot_path_for() {
  local rel="$1"
  case "$rel" in
    _shared/*)            echo "docs-init/templates/$rel" ;;
    */SKILL.md)           echo "docs-init/templates/${rel%/SKILL.md}/skill.template.md" ;;
    .tooling-version)     echo "" ;;   # generated, no upstream source
    *)                    echo "" ;;
  esac
}

# Classify a relpath against manifest globs (first match wins; else default).
classify() {
  REL="$1" MANIFEST="$MANIFEST" python3 - <<'PY'
import json, os, fnmatch
rel = os.environ["REL"]
m = json.load(open(os.environ["MANIFEST"]))
for r in m.get("rules", []):
    g = r["glob"]
    if fnmatch.fnmatch(rel, g) or (g.endswith("/**") and fnmatch.fnmatch(rel, g[:-3]+"/*")) \
       or (g.endswith("/**") and rel.startswith(g[:-3]+"/")):
        print(r["class"]); break
else:
    print(m.get("default", "managed"))
PY
}

# hash helper: stdin -> sha
sha() { git hash-object --stdin 2>/dev/null; }

# Enumerate every vendored file under SAT_SKILLS (relative paths), skip nothing.
while IFS= read -r abs; do
  rel="${abs#"$SAT_SKILLS"/}"
  src="$(ssot_path_for "$rel")"
  cls="$(classify "$rel")"

  # current local hash
  local_h="$(sha < "$abs")"

  if [[ -z "$src" ]]; then
    # No upstream source mapping (e.g. .tooling-version) — managed, nothing to compare.
    printf '%s\t%s\t%s\n' "$rel" "$cls" "same"
    continue
  fi

  base_h="$(git -C "$SSOT_ROOT" show "$BASE_COMMIT:$src" 2>/dev/null | sha || echo "")"
  up_h="$(git -C "$SSOT_ROOT" show "HEAD:$src" 2>/dev/null | sha || echo "")"

  if [[ -z "$up_h" ]]; then
    printf '%s\t%s\t%s\n' "$rel" "$cls" "removed-upstream"; continue
  fi

  local_changed="no"; up_changed="no"
  [[ -n "$base_h" && "$local_h" != "$base_h" ]] && local_changed="yes"
  [[ -n "$base_h" && "$up_h"   != "$base_h" ]] && up_changed="yes"
  # If base is unknown (file new since base), treat presence diff as upstream-changed.
  if [[ -z "$base_h" ]]; then
    [[ "$local_h" != "$up_h" ]] && up_changed="yes"
  fi

  if   [[ "$local_changed" == "yes" && "$up_changed" == "yes" ]]; then status="both-changed"
  elif [[ "$up_changed"    == "yes" ]];                          then status="upstream-changed"
  elif [[ "$local_changed" == "yes" ]];                          then status="local-changed"
  else                                                                status="same"
  fi
  printf '%s\t%s\t%s\n' "$rel" "$cls" "$status"
done < <(find "$SAT_SKILLS" -type f -not -name '.DS_Store' | sort)

# New-upstream: files present in SSOT HEAD but not yet vendored.
while IFS= read -r src; do
  case "$src" in
    docs-init/templates/_shared/*) rel="${src#docs-init/templates/}" ;;
    docs-init/templates/*/skill.template.md)
      mid="${src#docs-init/templates/}"; rel="${mid%/skill.template.md}/SKILL.md" ;;
    *) continue ;;
  esac
  [[ -e "$SAT_SKILLS/$rel" ]] && continue
  cls="$(classify "$rel")"
  printf '%s\t%s\t%s\n' "$rel" "$cls" "new-upstream"
done < <(git -C "$SSOT_ROOT" ls-tree -r --name-only HEAD -- docs-init/templates 2>/dev/null \
           | grep -E '(_shared/|/skill\.template\.md$)' || true)
