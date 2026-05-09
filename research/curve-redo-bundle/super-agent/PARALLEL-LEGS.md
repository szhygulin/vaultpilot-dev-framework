# Super-agent curve study — parallel leg dispatch

This document is the playbook for running legs of the super-agent curve experiment in parallel agents/worktrees. It complements [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md).

## Why parallel-by-leg

Phase C dispatches 6 legs of 6 trim agents × 13 issues each. Sequential wall time is ~3-4 hours; the experiment plan permits running multiple legs concurrently across worktrees on the same host as long as scratch clones and per-agent worktrees stay disjoint.

The launcher introduced here (`launch-leg-parallel.sh`) handles the **within-leg** parallelism (6 trims at once via per-trim filtered dispatch). **Cross-leg parallelism** is just running multiple launchers, one per leg, in separate worktrees.

## Bootstrap (per parallel agent)

Each agent that will dispatch a leg must:

1. **Branch off `origin/main`** in its own worktree.
   ```bash
   cd /Users/s/dev/vaultpilot/vaultpilot-dev-framework
   git fetch origin main
   git worktree add .claude/worktrees/super-agent-leg<N> -b super-agent/leg<N> origin/main
   cd .claude/worktrees/super-agent-leg<N>
   ```

2. **Build dist/** (each worktree has its own `node_modules` + `dist/`).
   ```bash
   npm ci && npm run build
   ```

3. **Regenerate `legs.json`** (deterministic; rewrites the leg→trim mapping but does not re-mint trims if registry already has them, does not re-clone if `/tmp/study-clones/<agent>-<repo>/.git` exists).
   ```bash
   node research/curve-redo-bundle/super-agent/build-super-trims.cjs
   ```

   The `agents/` and `state/` directories are gitignored and shared across worktrees via symlink (each worktree symlinks `agents → /Users/s/dev/vaultpilot/vaultpilot-dev-framework/agents` and `state → /Users/s/dev/vaultpilot/vaultpilot-dev-framework/state`). The 36 trim CLAUDE.mds and registry entries minted by the leg-1 agent are visible from every parallel agent. Skip step 3's regeneration if `research/curve-redo-data/super-agent/legs.json` already exists in this worktree (the gitignored data dir may already be populated by a prior agent on the same host).

4. **Launch the leg.**
   ```bash
   bash research/curve-redo-bundle/super-agent/launch-leg-parallel.sh <N>
   ```

   Outputs land under `research/curve-redo-data/super-agent/leg<N>/{logs,diffs,spawner-logs}/`. The launcher waits for all 6 child processes; spawner logs stream cell-by-cell progress.

## Coordination rules

- **One worktree per leg.** Two agents on the same leg would race on per-agent worktree branches.
- **Different legs use disjoint trim agents** (the legs-json chunking guarantees this), so cross-leg dispatches do not collide on registry entries or scratch clones.
- **Per-agent worktree races still apply within a leg.** `dispatch-super-leg.sh` serializes cells within a trim; the launcher's `--trim` filter ensures one bash process owns each trim's 13 cells.
- **Cost caps stack independently.** Each parallel-leg invocation has its own `MAX_TOTAL_COST_USD=30` per process and `VP_DEV_MAX_COST_USD=2.00` per cell. Operator-side aggregate budget is the sum across all running legs.
- **Don't clobber a sibling's leg dir.** Each `leg<N>/` directory is exclusively owned by one agent's launcher run. Re-running on the same leg is idempotent — completed cells skip via the `if [[ -s "$log_path" ]]; then continue; fi` check in `dispatch-super-leg.sh`, so a crash-resume picks up where it left off.

## Leg state

| Leg | Trim sizes (bytes) | Status | Notes |
|-----|-------------------|--------|-------|
| 1 | 0, 0, 0, 408, 408, 408 | **done** | $63.60, 78/78 cells, 3 cap-errors on #185 (small-trim seeds exhausted $2 cap) |
| 2 | 817 × 3, 1633 × 3 | open | — |
| 3 | 3266 × 3, 6533 × 3 | open | — |
| 4 | 13065 × 3, 26130 × 3 | open | — |
| 5 | 52261 × 3, 104521 × 3 | open | — |
| 6 | 156782 × 3, 209042 × 3 | open | — |

See [`leg1-results.md`](./leg1-results.md) for the leg-1 distributions and the smoke-check vs the curve-redo baseline.

## Smoke-check gate (per Phase C)

After each leg, verify:
- **Mean cell cost < 1.5× curve-redo-baseline mean** ($0.70). Leg 1 = $0.817 (1.17×) → PASS.
- **Per-issue cost stdev < ~1.5× baseline.** Leg 1 stdev across cells 0.85× baseline → PASS.
- **Error rate < 5%.** Leg 1 was 3.8% (3/78), all per-cell-cap hits on the same issue (#185).

If any threshold is exceeded, abort the leg and re-plan before the next one.

## Per-leg cost reference

Leg 1 actual: **$63.60** (mean $0.817/cell × 78). Use as a midpoint estimate for legs 2-6; expect modest growth as larger trims load more context per turn.
