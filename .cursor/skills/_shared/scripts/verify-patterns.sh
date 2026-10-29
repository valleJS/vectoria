#!/usr/bin/env bash
# verify-patterns.sh — enforce the machine-checkable rules in patterns.yaml. READ-ONLY, exit-code.
# Follows the verify-docs-principles.sh idiom: env-override -> default, [ERROR] lines, exit 1 on fail.
#
#   REPO_ROOT        repo to check       (default: git toplevel / cwd)
#   PATTERNS_FILE    registry override   (default: <skills>/_shared/reference/patterns.yaml)
#   PATTERN_SCOPE    restrict to one applies-to family: leaf | hub | skill | all (default all)
#
# Checks run: line-count, frontmatter-required, heading-depth. The `enum` rule (canonical-skills)
# is verified by the SSOT self-check (Phase G), and `llm` rules are judged by docs-defrag — both
# are skipped here by design.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"

# Locate the registry: explicit override, else next to this script's _shared/reference.
if [[ -z "${PATTERNS_FILE:-}" ]]; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"        # .../_shared/scripts
  PATTERNS_FILE="$here/../reference/patterns.yaml"
fi
if [[ ! -f "$PATTERNS_FILE" ]]; then
  echo "verify-patterns [ERROR]: no patterns.yaml at $PATTERNS_FILE" >&2
  exit 2
fi

command -v python3 >/dev/null 2>&1 || { echo "verify-patterns [ERROR]: python3 required" >&2; exit 2; }

REPO_ROOT="$REPO_ROOT" PATTERNS_FILE="$PATTERNS_FILE" PATTERN_SCOPE="${PATTERN_SCOPE:-all}" python3 - <<'PY'
import os, glob, re, sys

root = os.environ["REPO_ROOT"]
scope = os.environ.get("PATTERN_SCOPE", "all")

# --- minimal flat-YAML reader: enough for patterns.yaml's shape (list of dicts, scalar + [a, b]) ---
def parse_rules(path):
    rules, cur = [], None
    for raw in open(path):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^(\s*)-\s+id:\s*(.+)$", line)
        if m:
            if cur: rules.append(cur)
            cur = {"id": m.group(2).strip()}
            continue
        if cur is None:
            continue
        m = re.match(r"^\s+([a-zA-Z_-]+):\s*(.*)$", line)
        if m:
            k, v = m.group(1).strip(), m.group(2).strip()
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip() for x in v[1:-1].split(",") if x.strip()]
            elif v.startswith('"') and v.endswith('"'):
                v = v[1:-1]
            cur[k] = v
    if cur: rules.append(cur)
    return rules

def scope_of(applies):
    if applies.endswith("_index.md"): return "hub"
    if "SKILL.md" in applies: return "skill"
    if applies.startswith("docs/"): return "leaf"
    return "other"

def files_for(applies, exclude=None):
    # Directory-scope rules (enum) aren't file checks; skip.
    if applies.endswith("/"):
        return []
    excluded = set()
    if exclude:
        for e in (exclude if isinstance(exclude, list) else [exclude]):
            excluded.update(os.path.realpath(p) for p in glob.glob(os.path.join(root, e), recursive=True))
    out = []
    for h in glob.glob(os.path.join(root, applies), recursive=True):
        if os.path.isfile(h) and ".git" not in h.split(os.sep) and os.path.realpath(h) not in excluded:
            out.append(h)
    return out

def frontmatter(path):
    txt = open(path, encoding="utf-8", errors="replace").read()
    m = re.match(r"^---\n(.*?)\n---", txt, re.S)
    return m.group(1) if m else None

def max_heading_depth(path):
    depth = 0
    in_fence = False
    for ln in open(path, encoding="utf-8", errors="replace"):
        if ln.startswith("```"):
            in_fence = not in_fence; continue
        if in_fence: continue
        m = re.match(r"^(#{1,6})\s", ln)
        if m: depth = max(depth, len(m.group(1)))
    return depth

errors = 0
def err(msg):
    global errors
    sys.stderr.write(f"verify-patterns [ERROR]: {msg}\n"); errors += 1

rules = parse_rules(os.environ["PATTERNS_FILE"])
ran = 0
for r in rules:
    chk = r.get("check")
    applies = r.get("applies-to", "")
    if chk in ("llm", "enum"):        # judged elsewhere
        continue
    if scope != "all" and scope_of(applies) != scope:
        continue
    for f in files_for(applies, r.get("exclude")):
        rel = os.path.relpath(f, root)
        if chk == "line-count":
            n = sum(1 for _ in open(f, encoding="utf-8", errors="replace"))
            if n > int(r["max"]):
                err(f"{r['id']}: {rel} has {n} lines (max {r['max']}; see {r.get('ref')})")
            ran += 1
        elif chk == "frontmatter-required":
            fm = frontmatter(f)
            need = r["fields"] if isinstance(r["fields"], list) else [r["fields"]]
            if fm is None:
                err(f"{r['id']}: {rel} has no YAML frontmatter (needs {', '.join(need)}; see {r.get('ref')})")
            else:
                for field in need:
                    if not re.search(rf"^{re.escape(field)}\s*:", fm, re.M):
                        err(f"{r['id']}: {rel} missing frontmatter field '{field}' (see {r.get('ref')})")
            ran += 1
        elif chk == "heading-depth":
            d = max_heading_depth(f)
            if d > int(r["max"]):
                err(f"{r['id']}: {rel} has H{d} heading (max H{r['max']}; see {r.get('ref')})")
            ran += 1

if ran == 0:
    print("verify-patterns: no files matched the in-scope rules; nothing to check.")
if errors:
    print(f"verify-patterns: FAILED ({errors} error(s))")
    sys.exit(1)
print(f"verify-patterns: PASS ({ran} file-check(s))")
PY
