#!/usr/bin/env bash
# Super-agent random-trim scoring — Phase D of
# feature-plans/super-agent-curve-experiment-plan.md.
#
# For every cell log under $OUT_DIR/leg<N>/logs/curveStudy-<agent>-<issue>.log:
#   * parse the spawn log's envelope to get (decision, reason) and the diff
#     path written by --capture-diff-path during dispatch
#   * if decision == "implement" AND a non-empty diff exists: invoke
#     `vp-dev research run-tests` to apply the diff into a fresh clone, run
#     the issue's hidden-test suite, and write `<cellKey>-tests.json`
#   * if decision in {implement, pushback}: invoke
#     `vp-dev research grade-reasoning` for the K=3 Opus blind grade and
#     write `<cellKey>-judge.json`
#
# Cells with envelope.decision == "error" / null produce no score files —
# combine-super-curve.cjs scores them as 0 per `qualityFromAB`.
#
# Cells run independently per leg, so leg N's score step can pipeline with
# leg N+1's dispatch.
#
# Usage:
#   bash score-super-leg.sh <leg-number 1..N>

set -euo pipefail

LEG="${1:-}"
if [[ -z "$LEG" || ! "$LEG" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <leg-number>" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/research/curve-redo-data/super-agent}"
CORPUS="${CORPUS:-$REPO_ROOT/research/curve-redo-bundle/corpus.json}"
LEG_DIR="$OUT_DIR/leg${LEG}"
LOGS_DIR="$LEG_DIR/logs"
DIFFS_DIR="$LEG_DIR/diffs"
SCORES_DIR="$LEG_DIR/scores"
TESTS_BASE="${TESTS_BASE:-$REPO_ROOT/research/curve-redo-bundle/curve-redo-tests}"
SCORE_CLONES_DIR="${SCORE_CLONES_DIR:-$LEG_DIR/score-clones}"
LOG_PREFIX="${LOG_PREFIX:-curveStudy-}"

JUDGE_K="${JUDGE_K:-3}"

if [[ ! -d "$LOGS_DIR" ]]; then
  echo "ERROR: logs dir not found at $LOGS_DIR — run dispatch-super-leg.sh first." >&2
  exit 2
fi
if [[ ! -d "$TESTS_BASE" ]]; then
  echo "ERROR: hidden-tests dir not found at $TESTS_BASE." >&2
  exit 2
fi

mkdir -p "$SCORES_DIR" "$SCORE_CLONES_DIR"

echo "[$(date -Iseconds)] score-super-leg: leg=$LEG K=$JUDGE_K" >&2
echo "  logs=$LOGS_DIR" >&2
echo "  scores=$SCORES_DIR" >&2

# Per-issue metadata lookup (repo, framework, baseSha, testsDestRelDir).
declare -A ISSUE_REPO ISSUE_FRAMEWORK ISSUE_SHA ISSUE_TESTS_DEST
while IFS=$'\t' read -r issueId repo framework state cls sha testsDest; do
  [[ -z "$issueId" ]] && continue
  ISSUE_REPO["$issueId"]="$repo"
  ISSUE_FRAMEWORK["$issueId"]="$framework"
  ISSUE_SHA["$issueId"]="$sha"
  ISSUE_TESTS_DEST["$issueId"]="$testsDest"
done < <(node -e '
  const fs = require("node:fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  for (const i of c.issues) {
    process.stdout.write([
      i.issueId,
      i.repo,
      i.framework,
      i.state || "open",
      i.decisionClass || "",
      i.baseSha || "",
      i.testsDestRelDir || "",
    ].join("\t") + "\n");
  }
' "$CORPUS")

ensure_score_clone() {
  local issueId="$1" repo="$2" sha="$3"
  local name="${repo##*/}"
  local cdir="$SCORE_CLONES_DIR/${name}-${issueId}"
  if [[ ! -d "$cdir/.git" ]]; then
    local src=""
    local candidate
    for candidate in "${HOME:-/home}/dev/$name" "${HOME:-/home}/dev/vaultpilot/$name"; do
      if [[ -d "$candidate/.git" ]]; then
        src="$candidate"
        break
      fi
    done
    if [[ -n "$src" ]]; then
      git clone --quiet "$src" "$cdir" >&2
    else
      gh repo clone "$repo" "$cdir" -- --quiet >&2
    fi
  fi
  if [[ -n "$sha" ]]; then
    (cd "$cdir" && git fetch --quiet origin "$sha" 2>/dev/null || true)
    (cd "$cdir" && git reset --hard "$sha" --quiet)
  else
    (cd "$cdir" && git fetch --quiet origin main && git reset --hard origin/main --quiet)
  fi
  echo "$cdir"
}

parse_log() {
  local log="$1" cell_id="$2"
  python3 -c '
import json, re, sys, os, tempfile
text = open(sys.argv[1]).read()
obj = None
for anchor in ("\n{\n", "{\n"):
    idx = text.rfind(anchor)
    while idx >= 0:
        candidate = text[idx:].lstrip()
        try:
            obj = json.loads(candidate)
            break
        except json.JSONDecodeError:
            idx = text.rfind(anchor, 0, idx)
    if obj is not None:
        break

decision = ""
reason_path = ""
if obj is not None:
    env = obj.get("envelope") or {}
    decision = env.get("decision") or ""
    reason = env.get("reason") or ""
    if decision == "pushback" and reason:
        cell_id = sys.argv[2]
        out_dir = sys.argv[3]
        os.makedirs(out_dir, exist_ok=True)
        reason_path = os.path.join(out_dir, cell_id + ".pushback.txt")
        open(reason_path, "w").write(reason)
sys.stdout.write(decision + "\t" + reason_path + "\n")
' "$log" "$cell_id" "$SCORES_DIR/.tmp"
}

shopt -s nullglob
mapfile -t LOG_FILES < <(printf '%s\n' "$LOGS_DIR/${LOG_PREFIX}"agent-*-*.log | sort)
if [[ ${#LOG_FILES[@]} -eq 0 ]]; then
  echo "ERROR: no logs found at $LOGS_DIR/${LOG_PREFIX}*.log" >&2
  exit 2
fi

# Strip the prefix and split base="<agent>-<issue>" via the same regex shape
# the curve-study aggregator uses: agent-[a-z0-9-]+-(\d+)
total=${#LOG_FILES[@]}
done_count=0
prefix_re="^${LOG_PREFIX}(agent-[a-z0-9-]+)-([0-9]+)$"

for log in "${LOG_FILES[@]}"; do
  done_count=$((done_count + 1))
  base="$(basename "$log" .log)"
  if [[ ! "$base" =~ $prefix_re ]]; then
    echo "[$done_count/$total] skip (unrecognized name): $base" >&2
    continue
  fi
  agent="${BASH_REMATCH[1]}"
  issueId="${BASH_REMATCH[2]}"
  repo="${ISSUE_REPO[$issueId]:-}"
  framework="${ISSUE_FRAMEWORK[$issueId]:-}"
  sha="${ISSUE_SHA[$issueId]:-}"
  testsDest="${ISSUE_TESTS_DEST[$issueId]:-}"

  if [[ -z "$repo" || -z "$framework" ]]; then
    echo "[$done_count/$total] skip (no corpus entry for issue $issueId): $base" >&2
    continue
  fi

  echo "[$(date -Iseconds)] [$done_count/$total] $base (decision=parsing)" >&2
  parsed="$(parse_log "$log" "$base")"
  decision="${parsed%%$'\t'*}"
  reason_path="${parsed#*$'\t'}"

  diff_path="$DIFFS_DIR/${base}.diff"
  tests_dir="$TESTS_BASE/$issueId"

  # Score files are KEYED ON `<agent>-<issue>` (no LOG_PREFIX) so the
  # combine-super-curve.cjs glob doesn't have to know the dispatch prefix.
  cell_key="${agent}-${issueId}"
  tests_out="$SCORES_DIR/${cell_key}-tests.json"
  judge_out="$SCORES_DIR/${cell_key}-judge.json"

  if [[ "$decision" == "implement" && -s "$diff_path" && ! -s "$tests_out" ]]; then
    if [[ ! -d "$tests_dir" ]]; then
      echo "  WARN: no hidden tests at $tests_dir — skipping run-tests." >&2
    else
      clone="$(ensure_score_clone "$issueId" "$repo" "$sha")"
      cmd=(npm run vp-dev -- research run-tests
        --diff-path "$diff_path"
        --tests-dir "$tests_dir"
        --clone-dir "$clone"
        --framework "$framework"
        --out "$tests_out")
      if [[ -n "$testsDest" ]]; then
        cmd+=(--tests-dest-rel-dir "$testsDest")
      fi
      echo "  run-tests → $tests_out" >&2
      (cd "$REPO_ROOT" && "${cmd[@]}" >/dev/null 2>&1) || \
        echo "  WARN: run-tests exited non-zero (output preserved at $tests_out)" >&2
    fi
  fi

  if [[ ( "$decision" == "implement" || "$decision" == "pushback" ) && ! -s "$judge_out" ]]; then
    cmd=(npm run vp-dev -- research grade-reasoning
      --issue "$issueId"
      --target-repo "$repo"
      --decision "$decision"
      --k "$JUDGE_K"
      --out "$judge_out")
    if [[ "$decision" == "implement" && -s "$diff_path" ]]; then
      cmd+=(--diff-path "$diff_path")
    elif [[ "$decision" == "pushback" && -n "$reason_path" && -s "$reason_path" ]]; then
      cmd+=(--pushback-path "$reason_path")
    fi
    echo "  grade-reasoning → $judge_out" >&2
    (cd "$REPO_ROOT" && "${cmd[@]}" >/dev/null 2>&1) || \
      echo "  WARN: grade-reasoning exited non-zero (output preserved at $judge_out)" >&2
  fi

  if [[ "$decision" != "implement" && "$decision" != "pushback" ]]; then
    echo "  skip (decision=$decision)" >&2
  fi
done

echo "[$(date -Iseconds)] score-super-leg: leg=$LEG complete." >&2
