# #179 phase 3 leg 2 — handoff bundle

Self-contained kit for running the **dev-agents leg** of the phase 3 randomized curve study (`vaultpilot-development-agents` issues × 18 trim agents = 126 cells). Leg 1 (vp-mcp, 108 cells) is already done; combining both gives K=13 cells/agent, the variance-reduction target the ROADMAP "K=13 follow-up" bullet describes.

## Bundle contents

```
feature-plans/issue-179-leg2-bundle/
├── README.md                          (this file)
├── parent-agent-916a-CLAUDE.md        (60 KB) — seed for plan-trims (gitignored at agents/agent-916a/CLAUDE.md upstream)
├── agents-spec-phase3-dev.json        (44 KB) — leg-2 dispatch input (18 entries: 18 agents × dev-agents repo)
├── agents-spec-phase3-mcp.json        (44 KB) — leg-1 dispatch input, included for reference / agentId-size map
├── agents-spec-phase3.json            (88 KB) — full spec (36 entries, both legs combined)
├── trims-phase3/                      (576 KB, 18 files) — pre-generated trim CLAUDE.mds
├── leg-1-curve-study-mcp.json         (56 KB) — leg-1 fit output (linear-log, 108 cells, $123.70)
├── leg-1-logs.tar.gz                  (60 KB compressed → 860 KB extracted, 109 files) — per-cell spawn logs from leg 1 (tarballed because *.log is in .gitignore)
└── combine-legs.js                    — Node helper: aggregates leg-1 + leg-2 logs, fits linear-log, writes combined output
```

## Prerequisites on the executing agent

- A clone of this repo at `$REPO`. Branch `chore/issue-179-leg2-bundle` (this branch) or any branch that has the bundle file.
- `npm ci && npm run build` succeeds (linear-log default, regex fix, etc. are all on `main`).
- Local clone of `szhygulin/vaultpilot-development-agents` at `$HOME/dev/vaultpilot-development-agents` (or anywhere — only used as a clone source, not edited).
- `gh auth status` clean — read access for `szhygulin/vaultpilot-development-agents` issues.
- `~13 GB` free at `/tmp` (18 fresh clones × ~720 MB inflated, or ~360 MB if cloning shallowly via `--no-local`).
- Anthropic API key in env (`ANTHROPIC_API_KEY`).

## Step 1 — restore local state from the bundle

These files live at gitignored paths in the running repo, so they have to be copied out of the bundle.

```bash
cd $REPO
mkdir -p agents/agent-916a feature-plans/issue-179-data/trims-phase3 feature-plans/issue-179-data/logs-mcp

# Parent CLAUDE.md (used by plan-trims and as the agent-916a seed in the registry)
cp feature-plans/issue-179-leg2-bundle/parent-agent-916a-CLAUDE.md agents/agent-916a/CLAUDE.md

# Trims (18 files) and agents-specs
cp feature-plans/issue-179-leg2-bundle/trims-phase3/*.md feature-plans/issue-179-data/trims-phase3/
cp feature-plans/issue-179-leg2-bundle/agents-spec-phase3*.json feature-plans/issue-179-data/

# Leg-1 cell logs (extract tarball — *.log is in .gitignore so the bundle ships it as .tar.gz)
tar xzf feature-plans/issue-179-leg2-bundle/leg-1-logs.tar.gz -C feature-plans/issue-179-leg2-bundle/
cp feature-plans/issue-179-leg2-bundle/leg-1-logs/*.log feature-plans/issue-179-data/logs-mcp/
cp feature-plans/issue-179-leg2-bundle/leg-1-curve-study-mcp.json feature-plans/issue-179-data/curve-study-mcp.json
```

## Step 2 — register agent-916a + the 18 trim agents

If the registry already has these agents (same machine as leg 1), skip this step and verify with `node dist/bin/vp-dev.js agents list | grep agent-916a-trim | wc -l` (expect 18).

```bash
# The parent agent needs to exist before register-trims can copy its tags.
# If agent-916a is missing from state/agents-registry.json, you'll need to mint it manually
# OR pull a registry from the leg-1 machine. The trim agents can be added without it
# by passing --tags-from another existing agent, but the lineage will be off.

node dist/bin/vp-dev.js research register-trims \
  --agents-spec feature-plans/issue-179-data/agents-spec-phase3-dev.json \
  --trims-dir feature-plans/issue-179-data/trims-phase3/ \
  --tags-from agent-916a

# Verify: registry should have 18 new agents named agent-916a-trim-<size>-<seed>
node dist/bin/vp-dev.js agents list | grep agent-916a-trim | wc -l   # expect 18
```

## Step 3 — set up 18 dedicated clones

Each agent needs its own isolated clone so parallel cells don't race the working tree.

```bash
mkdir -p /tmp/study-clones

# Build a list of clone paths from the dev-agents agents-spec
jq -r '.[].clonePath' feature-plans/issue-179-data/agents-spec-phase3-dev.json > /tmp/leg2-clone-paths.txt
wc -l /tmp/leg2-clone-paths.txt  # expect 18

# Clone source = local working tree of the target repo (fast, no network)
DEV_AGENTS_SRC=$HOME/dev/vaultpilot-development-agents

# Clone all 18, 8-way parallel
xargs -a /tmp/leg2-clone-paths.txt -P 8 -I{} git clone --no-local "$DEV_AGENTS_SRC" {}

# Verify all 18 clones are real
for p in $(cat /tmp/leg2-clone-paths.txt); do [ -d "$p/.git" ] || echo "MISSING: $p"; done
du -sh /tmp/study-clones/  # ~250-400 MB total
```

## Step 4 — dispatch leg 2

108 cells already done in leg 1; this is the second 126.

```bash
mkdir -p feature-plans/issue-179-data/logs-dev

VP_DEV_MAX_COST_USD=15 node dist/bin/vp-dev.js research curve-study \
  --agents-spec feature-plans/issue-179-data/agents-spec-phase3-dev.json \
  --target-repo szhygulin/vaultpilot-development-agents \
  --issues 172,173,179,180,181,185,186 \
  --parallelism 8 \
  --no-target-claude-md --issue-body-only \
  --max-total-cost-usd 1500 \
  --logs-dir feature-plans/issue-179-data/logs-dev \
  --output feature-plans/issue-179-data/curve-study-dev.json \
  --curve-form linear-log
```

**Cost forecast (calibrated from leg 1):** leg 1 ran 108 cells for $123.70 in 50.9 min — $1.15/cell. Leg 2 has 126 cells; same per-cell cost gives **~$145**, ~60 min wall. The roadmap forecast was ~$882 / 2.4 h — much higher than the actual rate because `--issue-body-only` + `--no-target-claude-md` keep cells short and most issues hit pushback. Cap is $1500 to absorb tail-cost cells.

**Smoke first?** Optional — fire one cell against issue 172 (smallest dev-agents issue) at the smallest agent before the full leg:

```bash
jq '[.[0]]' feature-plans/issue-179-data/agents-spec-phase3-dev.json > /tmp/agents-spec-smoke.json
mkdir -p feature-plans/issue-179-data/logs-smoke-leg2
VP_DEV_MAX_COST_USD=15 node dist/bin/vp-dev.js research curve-study \
  --agents-spec /tmp/agents-spec-smoke.json \
  --target-repo szhygulin/vaultpilot-development-agents \
  --issues 172 \
  --parallelism 1 \
  --no-target-claude-md --issue-body-only \
  --max-total-cost-usd 10 \
  --logs-dir feature-plans/issue-179-data/logs-smoke-leg2 \
  --output feature-plans/issue-179-data/curve-study-smoke-leg2.json \
  --curve-form linear-log
```

Expect 1 cell, $1–$5, 1–3 min. `cellCount: 1` and a non-error envelope confirms the path.

## Step 5 — aggregate K=13 combined fit

After leg 2 completes, combine with leg 1 to get 18 agents × 13 issues each (6 vp-mcp + 7 dev-agents).

```bash
# Quick sanity: did leg 2 produce 126 cells?
ls feature-plans/issue-179-data/logs-dev/curveStudy-*.log | wc -l   # expect 126

# Combined fit: per-agent cells pool across both legs, scored together, fit linear-log on the 18 sample points
node feature-plans/issue-179-leg2-bundle/combine-legs.js \
  feature-plans/issue-179-data/logs-mcp \
  feature-plans/issue-179-data/logs-dev \
  feature-plans/issue-179-data/agents-spec-phase3-dev.json \
  feature-plans/issue-179-data/curve-study-combined-k13.json
```

Output prints headline stats:
```
Combined 234 cells (leg1=108, leg2=126) → ...curve-study-combined-k13.json
ACCURACY:   n=18, R²=0.xxxx, F(1,16)=x.xx, p=x.xxe-xx
TOKEN COST: n=18, R²=0.xxxx, F(1,16)=x.xx, p=x.xxe-xx
```

**Expected based on leg-1 leave-out-2-outliers analysis** (`feature-plans/issue-179-leg1-model-comparison.md`):
- K=6 leg-1 alone: accuracy p=0.097, token cost p=0.176
- K=6 leg-1 minus 2 outliers: accuracy p=2.76e-4, R²=0.62
- K=13 combined: outliers' leverage drops from 1/3 to 1/13 per size, signal should clear p<0.05 organically without manual exclusion.

## Step 6 — hand-merge into `src/util/contextCostCurve.ts` (only if p < 0.05)

If the combined fit clears significance, hand-merge the per-agent samples into `ACCURACY_DEGRADATION_SAMPLES` / `TOKEN_COST_SAMPLES`. The samples-to-merge are in `curve-study-combined-k13.json` under `accuracy.samples` and `tokenCost.samples`. Include a provenance comment naming the run date, model, and total cell count.

If p ≥ 0.05, **don't merge**. Either escalate to K=18+ (re-dispatch the same agents against fresh issues) or accept that the signal is below detection threshold for this issue mix and switch to ROADMAP phase 5 (token-cost only).

## Step 7 — cleanup (once the data is locked in)

```bash
# Deregister the 18 trim agents from the local registry
# (no CLI command exists — edit state/agents-registry.json by hand or with jq)

# Delete clones (~360 MB)
rm -rf /tmp/study-clones/agent-916a-trim-*-vaultpilot-development-agents

# Optionally delete the local trim files + logs (gitignored, takes ~1.5 MB)
rm -rf feature-plans/issue-179-data/trims-phase3 feature-plans/issue-179-data/logs-dev
```

## Notes on harness state

- `--curve-form linear-log` is now the default per [PR #189](https://github.com/szhygulin/vaultpilot-development-agents/pull/189). Pass it explicitly above so the dispatch is reproducible if the default is ever changed back.
- `aggregate.ts` regex was widened to `agent-[a-z0-9-]+` in [PR #188](https://github.com/szhygulin/vaultpilot-development-agents/pull/188). Without that fix, every leg-2 cell would aggregate to 0 cells. Verify your branch is downstream of `52a5190` (the merge-commit for #189, which includes #188) before dispatching.
- Per-cell budget cap: `VP_DEV_MAX_COST_USD=15` env var (curve-study has no `--max-cost-usd` flag; this is the only knob). Run-wide cap: `--max-total-cost-usd 1500`.
- The `--issue-body-only` and `--no-target-claude-md` flags are CRITICAL — without them, effective context size differs from the per-agent CLAUDE.md size we're varying, and the curve becomes uninterpretable.
