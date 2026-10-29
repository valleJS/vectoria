#!/usr/bin/env bash
# Structural verification: profile, L1/L3 indices, skills, rules, forbidden paths, Claude symlinks.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
cd "$REPO_ROOT"

PROFILE="${DOC_PROFILE:-$REPO_ROOT/.cursor/agent-profile.json}"
SKILLS_DIR="$REPO_ROOT/.cursor/skills"
RULES_DIR="$REPO_ROOT/.cursor/rules"
CLAUDE_SKILLS="${CLAUDE_SKILLS:-$HOME/.claude/skills}"

ERRORS=0
warn() { echo "verify-docs [WARN]: $*" >&2; }
err() { echo "verify-docs [ERROR]: $*" >&2; ERRORS=$((ERRORS + 1)); }

realpath_portable() {
  python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1" 2>/dev/null \
    || readlink -f "$1" 2>/dev/null \
    || echo "$1"
}

jq_array_to_bash() {
  local varname="$1" query="$2" file="$3"
  local -a arr=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && arr+=("$line")
  done < <(jq -r "$query" "$file" 2>/dev/null || true)
  if ((${#arr[@]} == 0)); then
    eval "$varname=()"
  else
    eval "$varname=(\"\${arr[@]}\")"
  fi
}

glob_any_file_py() {
  REPO_ROOT="$REPO_ROOT" python3 -c '
import glob, os, pathlib, sys
root = pathlib.Path(os.environ["REPO_ROOT"])
for p in sys.argv[1:]:
    if not p:
        continue
    for h in glob.glob(str(root / p), recursive=True):
        ph = pathlib.Path(h)
        if ph.is_file() and ".git" not in ph.parts:
            sys.exit(0)
sys.exit(1)
' "$@"
}

glob_print_files_py() {
  REPO_ROOT="$REPO_ROOT" python3 -c '
import glob, os, pathlib, sys
root = pathlib.Path(os.environ["REPO_ROOT"])
for p in sys.argv[1:]:
    if not p:
        continue
    for h in glob.glob(str(root / p), recursive=True):
        ph = pathlib.Path(h)
        if ph.is_file() and ".git" not in ph.parts:
            print(str(ph))
' "$@"
}

# Canonical skill set: read from patterns.yaml (rule canonical-skills) so there is ONE source.
# Falls back to the built-in list if the registry is unavailable.
SCRIPT_DIR_VD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PATTERNS_YAML="${PATTERNS_FILE:-$SCRIPT_DIR_VD/../reference/patterns.yaml}"
CANON_SKILLS=()
if [[ -f "$PATTERNS_YAML" ]] && command -v python3 >/dev/null 2>&1; then
  while IFS= read -r s; do [[ -n "$s" ]] && CANON_SKILLS+=("$s"); done < <(
    PATTERNS_YAML="$PATTERNS_YAML" python3 - <<'PY'
import os, re
txt = open(os.environ["PATTERNS_YAML"]).read()
# find the canonical-skills rule block, read its `values: [a, b, c]`
m = re.search(r"id:\s*canonical-skills.*?values:\s*\[([^\]]*)\]", txt, re.S)
if m:
    for v in m.group(1).split(","):
        v = v.strip()
        if v: print(v)
PY
  )
fi
if [[ ${#CANON_SKILLS[@]} -eq 0 ]]; then
  CANON_SKILLS=(docs-write docs-verify docs-defrag docs-commit)   # fallback if registry missing
fi
# Forbidden = the historic names that must never reappear as selectable skills.
# (docs-commit was reintroduced as a distinct commit-orchestrator verb — see its SKILL.md — so it is
#  no longer forbidden; the old docs-commit was a verify-gate duplicate, this one is not.)
FORBIDDEN_NAMES=(hybrid docs-update docs-concepts docs-shared docs-pr-check docs-writer docs-sync)

echo "verify-docs: repo=$REPO_ROOT"

if [[ -f "$PROFILE" ]]; then
  command -v jq >/dev/null 2>&1 || { err "jq not installed; required to parse $PROFILE"; }
  echo "verify-docs: profile OK ($PROFILE)"
else
  warn "no profile at $PROFILE (optional but recommended)"
fi

L1_PATHS=()
L3_GLOBS=()
if [[ -f "$PROFILE" ]] && command -v jq >/dev/null 2>&1; then
  jq_array_to_bash L1_PATHS '.documentation.l1Paths[]? // empty' "$PROFILE"
  jq_array_to_bash L3_GLOBS '.documentation.l3Globs[]? // empty' "$PROFILE"
  hp="$(jq -r '.harnessPath // empty' "$PROFILE" 2>/dev/null || true)"
  if [[ -n "$hp" ]]; then
    if [[ -f "$REPO_ROOT/$hp/WORKSPACE.md" ]]; then
      echo "verify-docs: harness OK: $hp"
    else
      warn "harnessPath '$hp' has no WORKSPACE.md"
    fi
  fi
fi
if [[ ${#L1_PATHS[@]} -eq 0 ]]; then
  L1_PATHS=(AGENTS.md CLAUDE.md docs/_index.md)
fi
for p in "${L1_PATHS[@]}"; do
  [[ -z "$p" ]] && continue
  if [[ ! -f "$REPO_ROOT/$p" ]]; then
    err "L1 index missing: $p"
  else
    echo "verify-docs: L1 present: $p"
  fi
done

if [[ ${#L3_GLOBS[@]} -gt 0 ]]; then
  if glob_any_file_py "${L3_GLOBS[@]}"; then
    echo "verify-docs: L3 globs matched at least one file"
  else
    err "L3 glob(s) matched no files: ${L3_GLOBS[*]}"
  fi
else
  echo "verify-docs: L3 globs not set in profile; skipping L3 file existence"
fi

for s in "${CANON_SKILLS[@]}"; do
  if [[ ! -d "$SKILLS_DIR/$s" ]]; then
    err "missing skill directory: $SKILLS_DIR/$s"
  elif [[ ! -f "$SKILLS_DIR/$s/SKILL.md" ]]; then
    err "missing SKILL.md in $SKILLS_DIR/$s"
  else
    echo "verify-docs: skill OK: $s"
  fi
done

if [[ -d "$SKILLS_DIR" ]]; then
  for bad in "${FORBIDDEN_NAMES[@]}"; do
    if [[ -e "$SKILLS_DIR/$bad" ]]; then
      err "forbidden skill path present: $SKILLS_DIR/$bad"
    fi
  done
fi

if [[ -d "$RULES_DIR" ]]; then
  count=$(find "$RULES_DIR" -maxdepth 1 -name '*.mdc' -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "verify-docs: rules dir present ($count .mdc at top level)"
else
  echo "verify-docs: no $RULES_DIR (optional)"
fi

IFS=',' read -r -a FORB <<< "${DOC_FORBIDDEN_GLOBS:-}"
if [[ -f "$PROFILE" ]] && command -v jq >/dev/null 2>&1; then
  jq_array_to_bash PROFILE_FOR '.documentation.forbiddenGlobs[]? // empty' "$PROFILE"
  if ((${#PROFILE_FOR[@]} > 0)); then
    FORB+=("${PROFILE_FOR[@]}")
  fi
fi
if [[ ${#FORB[@]} -gt 0 ]]; then
  while IFS= read -r hit; do
    [[ -n "$hit" ]] && err "forbidden path hit: $hit"
  done < <(glob_print_files_py "${FORB[@]}")
fi

for s in "${CANON_SKILLS[@]}"; do
  link="$CLAUDE_SKILLS/$s"
  want="$(realpath_portable "$SKILLS_DIR/$s")"
  if [[ -L "$link" ]]; then
    got="$(realpath_portable "$link")"
    if [[ "$got" != "$want" ]]; then
      err "Claude symlink $link resolves to '$got', expected '$want'"
    else
      echo "verify-docs: Claude symlink OK: $s"
    fi
  else
    warn "Claude symlink missing (run link-claude-bridge.sh): $link"
  fi
done

# Pattern gate: run the declarative machine checks from patterns.yaml as an additional layer.
PATTERNS_SH="$SCRIPT_DIR_VD/verify-patterns.sh"
if [[ -x "$PATTERNS_SH" ]]; then
  if ! REPO_ROOT="$REPO_ROOT" PATTERNS_FILE="$PATTERNS_YAML" bash "$PATTERNS_SH"; then
    err "pattern checks failed (see verify-patterns output above)"
  fi
else
  warn "verify-patterns.sh not found/executable at $PATTERNS_SH (skipping pattern gate)"
fi

if [[ $ERRORS -gt 0 ]]; then
  echo "verify-docs: FAILED ($ERRORS error(s))"
  exit 1
fi
echo "verify-docs: PASS"
