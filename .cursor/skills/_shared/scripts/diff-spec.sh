#!/usr/bin/env bash
# diff-spec.sh — READ-ONLY. Surface the SPEC delta between the vendored base and the SSOT HEAD, so
# docs-defrag step 0f can migrate the satellite's docs/ to match the new spec. Writes nothing.
#
# "Spec" = the files that DICTATE what docs/ must look like:
#   - _shared/reference/patterns.yaml   (the machine-checkable rules: required fields, line caps, …)
#   - docs/_index.template.md           (reserved hub template)
#   - docs/_router.template.md          (reserved router template)
#   - _shared/reference/agent-doc-layout.md  (prose spec for leaf frontmatter + layout)
#
# For each changed spec file it prints a TAG block (coarse hints — the AGENT interprets them) then the
# raw `git diff BASE..HEAD` for that file. Exit 0 always (advisory, never a gate).
#
# Inputs (auto-resolved, env-overridable):
#   SSOT_ROOT     checked-out SSOT repo   (default: realpath of ~/.claude/skills/docs-init's repo)
#   BASE_COMMIT   the vendored base commit to diff FROM. IMPORTANT: docs-defrag captures the OLD
#                 ssot_commit BEFORE step 0e re-stamps .tooling-version, and passes it here. If unset,
#                 falls back to ssot_commit from .tooling-version (only correct if NOT yet re-stamped).
#   REPO_ROOT     satellite repo          (default: git toplevel / cwd) — used only for the fallback.
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
  echo "diff-spec [ERROR]: cannot locate SSOT repo (set SSOT_ROOT)" >&2
  exit 2
fi

# Resolve BASE: explicit override wins; else ssot_commit from .tooling-version (fallback only).
BASE_COMMIT="${BASE_COMMIT:-}"
TV="$SAT_SKILLS/.tooling-version"
if [[ -z "$BASE_COMMIT" && -f "$TV" ]]; then
  BASE_COMMIT="$(awk -F= '/^ssot_commit=/{print $2}' "$TV")"
fi
[[ -n "$BASE_COMMIT" ]] || { echo "diff-spec [ERROR]: no BASE_COMMIT / .tooling-version" >&2; exit 2; }

HEAD_COMMIT="$(git -C "$SSOT_ROOT" rev-parse HEAD)"

if [[ "$BASE_COMMIT" == "$HEAD_COMMIT" ]]; then
  echo "diff-spec: spec unchanged (base == HEAD). No doc migration needed."
  exit 0
fi

# The spec files, SSOT-repo-relative.
SPEC_FILES=(
  "docs-init/templates/_shared/reference/patterns.yaml"
  "docs-init/templates/docs/_index.template.md"
  "docs-init/templates/docs/_router.template.md"
  "docs-init/templates/_shared/reference/agent-doc-layout.md"
)

show() { git -C "$SSOT_ROOT" show "$1:$2" 2>/dev/null || true; }

echo "diff-spec: BASE=${BASE_COMMIT:0:7} HEAD=${HEAD_COMMIT:0:7} (SSOT=$SSOT_ROOT)"
echo

any=0
for src in "${SPEC_FILES[@]}"; do
  base_blob="$(show "$BASE_COMMIT" "$src")"
  head_blob="$(show "$HEAD_COMMIT" "$src")"

  if [[ "$base_blob" == "$head_blob" ]]; then
    continue
  fi
  any=1
  echo "=== SPEC-CHANGED $src ==="

  # Coarse tags — hints for the agent, derived from the textual delta. Not authoritative.
  if [[ -z "$base_blob" && -n "$head_blob" ]]; then
    echo "  TAG NEW-SPEC-FILE $src"
    case "$src" in
      */docs/_*.template.md)
        reserved="docs/$(basename "${src%.template.md}").md"
        echo "  TAG RESERVED-FILE-NEW $reserved  (seed into satellite if absent)"
        ;;
    esac
  fi

  # patterns.yaml: detect required-field and rule-id additions/removals via line diff.
  if [[ "$src" == *patterns.yaml ]]; then
    diff_body="$(diff <(printf '%s' "$base_blob") <(printf '%s' "$head_blob") || true)"
    # fields: lines that gained/lost tokens
    while IFS= read -r line; do
      case "$line" in
        ">"*"fields:"*) echo "  TAG FIELDS-NOW $(echo "$line" | sed 's/^> *//')" ;;
        "<"*"fields:"*) echo "  TAG FIELDS-WAS $(echo "$line" | sed 's/^< *//')" ;;
        ">"*"- id:"*)   echo "  TAG RULE-ADDED $(echo "$line"   | sed 's/^> *- id: *//')" ;;
        "<"*"- id:"*)   echo "  TAG RULE-REMOVED $(echo "$line" | sed 's/^< *- id: *//')" ;;
      esac
    done <<< "$diff_body"
  fi

  echo "  --- diff BASE..HEAD ---"
  git -C "$SSOT_ROOT" diff "$BASE_COMMIT" "$HEAD_COMMIT" -- "$src" 2>/dev/null \
    | sed 's/^/  /' || true
  echo
done

if [[ "$any" == "0" ]]; then
  echo "diff-spec: no spec files changed between base and HEAD. No doc migration needed."
else
  echo "diff-spec: spec delta above. docs-defrag step 0f migrates docs/ to match (proposal, never auto-commit)."
fi
exit 0
