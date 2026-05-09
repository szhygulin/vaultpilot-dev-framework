# Super-agent curve-fit experiment

## Context

Three picker arms ([#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) Jaccard, [#269](https://github.com/szhygulin/vaultpilot-dev-framework/pull/269) naive, [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272) prose-LLM) all tied at −17 quality points vs. the trim baseline on the same 13-issue corpus. Picker quality is not the bottleneck; per-agent specialization is not the bottleneck. The user's hypothesis: **a single super-agent containing the deduped union of every existing agent's CLAUDE.md, given to every dispatched agent, is the right architecture.** This experiment finds the optimal lesson-pool size by replicating the curve-redo (issue [#179](https://github.com/szhygulin/vaultpilot-dev-framework/issues/179)) random-trim methodology with the super-agent as the parent and an AIC sweep that includes degree=3.

User-confirmed parameters:
- **K=1** replicate per cell (matches curve-redo).
- **Opus-driven cross-agent dedup** for the super-agent build.
- **AIC sweep across degree {1,2,3} × xTransform {identity, log}** with leave-out-N-outliers refit.
- **12 sizes × 3 seeds = 36 trim agents** (more sizes than the 6 used in curve-redo for better degree=3 resolution).
- **Phase C dispatch split into 6 legs** of 6 trim agents each, with operator checkpoint between legs.

Budget envelope: ~$780-800 (Phase A $15-25 + Phase C $655 (6 legs × ~$110) + Phase D $110). Wall ~3-4 hours sequential, ~45 min if all 6 legs run in parallel (needs 6 scratch clones per target repo).

## Why 12 sizes × 3 seeds = 36 samples

For the AIC sweep across 6 candidate forms (degree {1,2,3} × xTransform {identity, log}) with the local CLAUDE.md "Research-tool regression methodology" rule's leave-out-N-outliers refit:

- **Residual df budget**: poly3 has 4 free parameters. n=18 (6×3) leaves df=14 — workable but ΔAIC ranking is noisy at this density. n=36 leaves df=32, materially tighter on every form's fit.
- **Curve resolution at the tails**: poly3 is shaped by its endpoints. With 6 sizes geometric-spaced at ratio 2, the bottom octave gets only 1-2 samples; an outlier seed there can flip the inferred curvature. 12 sizes at ratio √2 give 2-3 samples per octave.
- **Compatibility with leave-out-2**: dropping 2 outliers from n=18 leaves n=16, df=12 for poly3 — getting cramped. n=36 → 34, df=30 — comfortable.
- **Cost trade**: 36 trims vs 18 trims = 2× dispatch cost ($655 vs $330). Acceptable given the experiment is the load-bearing answer to the picker-vs-content question.

**Size grid** (geometric, ratio ≈ √2): `[0, S/512, S/256, S/128, S/64, S/32, S/16, S/8, S/4, S/2, 3S/4, S]` rounded to whole KB. With S ≈ 400 KB → roughly `[0, 1K, 2K, 3K, 6K, 12K, 25K, 50K, 100K, 200K, 300K, 400K]`. Adjust if S falls outside the 300-650 KB acceptance range from Phase A.

## Phase A — Build super-agent CLAUDE.md (~$15-25, one Opus call)

**New file**: `research/curve-redo-bundle/super-agent/build-super-agent.cjs` (~150 lines, modeled on `research/curve-redo-bundle/specialist-redo/mint-naive-agent.cjs`).

Steps:
1. Read `state/agents-registry.json`. Filter eligible agents: drop `agent-916a-trim-*`, `archived: true`, `mergedInto != null`, `agent-8274` (naive). Pool: ~47 agents.
2. For each, read `agents/<id>/CLAUDE.md` and parse via `parseClaudeMdSections()` from `dist/src/agent/split.js`. Concatenate all sections; prefix each section's id with `<agentId>:` for provenance. Preserve original sentinel headers verbatim so `compactClaudeMd`'s parser recovers `runId` / `issueId`.
3. Build a synthetic `AgentRecord` (`agentId: "agent-super-pool"`, `tags: union of contributors`) to satisfy `proposeCompaction()`'s input shape.
4. Call `proposeCompaction({ agent: synthetic, claudeMd: <reconstructed pooled MD>, minClusterSize: 3 })` from `dist/src/agent/compactClaudeMd.js`. The system prompt at `src/agent/compactClaudeMd.ts:438-462` already mandates preservation of past-incident dates / mechanisms / "Tells" / "How to apply" — exactly the union semantics needed.
5. Validator gates (`findDroppedIncidentDates`, `findClampedBodies`): abort if any cluster has warnings — do **not** apply. The proposal is the authoritative output.
6. Render the super-agent CLAUDE.md by walking pooled sections in source order: emit one merged block per cluster (use `renderMergedBlock` at `compactClaudeMd.ts:858`, `runId merge-super-<ISO>`); emit unclustered sections verbatim.
7. Mint via `mutateRegistry((reg) => createAgent(reg, { agentId: "agent-super", name: "Super", tags: ["super-agent"] }))` and write to `agents/agent-super/CLAUDE.md`.
8. **Sanity output (printed)**: contributor count, total input bytes, post-merge bytes, retention %, cluster count, unclustered count, validator-warning count (must be 0).

Acceptable retention range: **25-50%** of input (300-650 KB out of ~1.3 MB). Outside that, rerun with `minClusterSize: 2` or `: 4`.

## Phase B — Random-trim sweep (~$0, deterministic)

**New file**: `research/curve-redo-bundle/super-agent/build-super-trims.cjs` (~80 lines).

1. Read `agents/agent-super/CLAUDE.md`. Note size `S`.
2. Define 12 sizes spanning 0 → S geometrically (ratio ≈ √2): `[0, S/512, S/256, S/128, S/64, S/32, S/16, S/8, S/4, S/2, 3S/4, S]` rounded to nearest KB. With S ≈ 400 KB → roughly `[0, 1K, 2K, 3K, 6K, 12K, 25K, 50K, 100K, 200K, 300K, 400K]`.
3. **3 seeds × 12 sizes = 36 trims**.
4. Drive `planRandomTrims({ parent, sizes, replicates: 3, seedBase: 19 })` from `dist/src/research/curveStudy/randomTrim.js`. Mulberry32 PRNG; seed formula `seedBase + size + (k * 1000003)` is deterministic — re-runs reproduce byte-identical trims (verification path).
5. For each `TrimPlan`, mint `agent-super-trim-<sizeKB>-s<seed>` via the same mint-with-prebuilt pattern as Phase A step 7.
6. Pre-create per-agent target-repo clones at `/tmp/study-clones/<agentId>-vaultpilot-mcp` and `<agentId>-vaultpilot-dev-framework` (mirrors `score-leg1.sh:36`).
7. **Group trims into 6 legs of 6 agents each** by sorting on `(sizeBytes, seed)` and chunking sequentially. Leg N (1-indexed) gets trims `[6(N-1)..6N)`. This puts adjacent-size trims in the same leg, so a per-leg sanity plot already shows local curve shape — useful for early-warning if any leg's mean Q is wildly off the trend. Write the assignment to `research/curve-redo-data/super-agent/legs.json`.

## Phase C — Dispatch K=1 against the 13-issue corpus (6 legs × ~$110 each, ~$655 total)

**No code modification needed.** `dispatchCells()` at `src/research/curveStudy/dispatch.ts:76` already accepts the super-trim agentId pattern — its log-name regex `curveStudy-(agent-[a-z0-9-]+)-(\d+)\.log$` matches `curveStudy-agent-super-trim-200000-s200019-156.log`.

**New shell wrapper**: `research/curve-redo-bundle/super-agent/dispatch-super-leg.sh`, copied from `research/curve-redo-data/dispatch-leg1.sh` with these changes:
- Take `<leg-number 1..6>` as positional arg; read leg→trims mapping from `research/curve-redo-data/super-agent/legs.json` (written by Phase B step 7).
- Source the trim spec from Phase B's JSON (not `agents-spec-phase3.json`).
- Iterate **both legs** of `research/curve-redo-bundle/corpus.json` for issues (drop the `select(.leg == 1)` filter on the corpus side; the new "leg" axis is over trim agents, the corpus axis stays at 13 issues).
- Per-issue `--target-repo`: `vaultpilot-mcp` for corpus-leg-1, `vaultpilot-dev-framework` for corpus-leg-2.
- Output dir: `research/curve-redo-data/super-agent/leg<N>/{logs,diffs}/` so each leg is independently inspectable.

**Cell shape per leg**: 6 trims × 13 issues × K=1 = **78 cells per leg** × 6 legs = 468 cells total. Per-cell flags unchanged: `--dry-run --skip-summary --research-mode --allow-closed-issue --issue-body-only --no-target-claude-md --capture-diff-path ...`. Parallelism 4-5 (per-agent serialization enforced inside `dispatchCells` line 91-103). Per-cell cap `--max-cost-usd 2.00`; per-leg budget hint `maxTotalCostUsd: 130`.

**Smoke leg before full sweep**: dispatch leg 1 only (78 cells, ~$110, ~30 min wall). Inspect cell-cost distribution and per-issue Q variance. If mean cost or variance > 1.5× the curve-redo baseline, abort and re-plan before consuming the next 5 legs.

**Operator checkpoint between legs**: after each leg completes, the operator approves the next leg's launch. The legs.json file groups trims by `(sizeBytes, seed)` so each leg is a contiguous slice of the size axis — a per-leg quick-look plot reveals local curve shape early.

**Cost ceiling defense in depth**:
- Per-cell `--max-cost-usd 2.00` (hard cap inside the SDK).
- Per-leg `--max-total-cost-usd 130` env override.
- Operator-side aggregate cap: explicit checkpoint after each leg, with abort path if running total exceeds plan budget.

**Wall time options**:
- Sequential (6 legs × ~30 min): ~3 hours. Single set of 5 scratch clones per repo. Lower memory pressure.
- Parallel-6 (all legs at once): ~30 min. Requires 6 sets of scratch clones per repo (12 clones total per repo); same `dispatchCells` parallelism inside each leg. Higher disk + memory pressure but ~6× faster end-to-end. Recommended only if Phase A and Phase B sanity-checked clean.

## Phase D — Score (~$110, can run per-leg in parallel with Phase C)

**New file**: `research/curve-redo-bundle/super-agent/score-super-leg.sh`, copied from `score-leg1.sh` with these changes:
- Take `<leg-number 1..6>` as positional arg; iterate logs under `research/curve-redo-data/super-agent/leg<N>/logs/`.
- Per-cell target-repo lookup from corpus.json (existing leg-1 hard-codes `TARGET_REPO=szhygulin/vaultpilot-mcp`).
- Output dir: `research/curve-redo-data/super-agent/leg<N>/scores/`.

Reuses `vp-dev research run-tests` + `vp-dev research grade-reasoning` (Opus K=3 judge medians + hidden-test pass rate). Tests run only on `implement` cells with non-empty diffs.

Each leg's score step is independent — score leg N as soon as its dispatch leg N completes, in parallel with leg N+1 dispatch. ~$18 judge cost per leg.

## Phase E — Curve fit + AIC sweep (no source edits)

**Discovery**: `src/research/curveStudy/regression.ts:fitPolynomialRegression()` at line 167 is already degree-generic — `m = degree + 1`, design-matrix loop at line 206, `solveLinearSystem` is degree-agnostic. **No code change needed for degree=3.** (Add a degree=3 unit test to `regression.test.ts` for confirmation; ~5 lines.)

**New combiner**: `research/curve-redo-bundle/super-agent/combine-super-curve.cjs` (~120 lines).
1. Load per-cell `QualityScore` arrays from all 6 legs' Phase D outputs via `dist/src/research/curveStudy/cellScores.js`. Glob `research/curve-redo-data/super-agent/leg*/scores/`.
2. Project to `CurveSample[]` (per-agent aggregation: `xBytes` = trim size, `factor` = mean Q across 13 issues). With 36 trim agents × 13 issues = 468 cells aggregated to 36 samples.
3. Fit all 6 forms:
   ```
   { degree:1, xTransform:"identity" }, { degree:1, xTransform:"log" },
   { degree:2, xTransform:"identity" }, { degree:2, xTransform:"log" },
   { degree:3, xTransform:"identity" }, { degree:3, xTransform:"log" }
   ```
4. AIC = `n · ln(rss/n) + 2·(degree+1)`; pick min-AIC, report ΔAIC for the rest.
5. **Leave-out-N-outliers refit** per local CLAUDE.md "Research-tool regression methodology" (lines 101-105 of `CLAUDE.md`): rank samples by `|residual|`, drop top 1-2, refit, recompute p. If p drops by >1 order of magnitude, the dropped seeds were absorbing variance — name them in the writeup (per the 2026-05-06 `s10*029` incident). With n=36 → 34 after leave-out-2, df=30 for poly3 — comfortable.
6. **Per-leg sanity sub-fit**: also fit each leg's 6 samples in isolation. If any individual leg's residual is wildly different from the global fit, that leg's seeds may be defective; surface the discrepancy in the writeup.
7. Overlay against the existing `agent-916a` curve (`research/curve-redo-data/leg{1,2}-baseline/`) on identical x-axis bytes. Test "super-agent ≥ trim baseline at every size point."

## Phase F — Writeup + PR

**File**: `research/curve-redo-bundle/super-agent-results.md` + `super-agent-results.tar.gz` (picks JSON, regression JSON, AIC table).

Headline triad:
- Which AIC form wins (poly3-raw / poly3-log / lower).
- Peak Q at what byte size.
- Super-agent vs agent-916a at matched size points.

4-arm matrix:
| Arm | Q mean | Δ vs trim baseline |
|---|---|---|
| trim baseline (existing 18 trims) | existing | — |
| super-agent at peak size | TBD | TBD |
| super-agent at full S | TBD | TBD |
| super-agent at 0KB (seed only) | TBD | TBD |

Open the PR on a worktree at `.claude/worktrees/study-super-agent-curve` branched from `origin/main`.

## Critical files

| Path | Role |
|---|---|
| `src/agent/compactClaudeMd.ts` (`proposeCompaction`, `renderMergedBlock`, validators) | Phase A — Opus-driven dedup primitive |
| `src/agent/split.ts` (`parseClaudeMdSections`) | Phase A — section parsing |
| `src/state/registry.ts` (`mutateRegistry`, `createAgent`) | Phases A, B — minting |
| `src/agent/specialization.ts` (`agentClaudeMdPath`) | Phases A, B — write path |
| `src/research/curveStudy/randomTrim.ts` (`planRandomTrims`) | Phase B — deterministic trims |
| `src/research/curveStudy/dispatch.ts` (`dispatchCells`) | Phase C — already accepts super-trim agentIds |
| `src/research/curveStudy/regression.ts` (`fitPolynomialRegression`) | Phase E — degree-generic, no edits |
| `src/research/curveStudy/cellScores.js` (built) + `fit.ts` (`projectToCurveSamples`) | Phase E — sample aggregation |
| `research/curve-redo-bundle/corpus.json` | Corpus of 13 issues across both repos |
| `research/curve-redo-data/dispatch-leg1.sh` / `score-leg1.sh` | Phases C, D — wrappers to fork |
| `research/curve-redo-bundle/specialist-redo/mint-naive-agent.cjs` | Phases A, B — mint-with-prebuilt pattern |

## Risks

- **Dedup quality flattening.** `proposeCompaction`'s prompt is tuned for one agent's near-duplicates; cross-agent prose has more genuine semantic divergence. Opus may over-cluster (lessons disappear) or under-cluster (~1.2 MB output). Mitigation: gate on validator warnings == 0 AND retention% ∈ [25%, 50%]; rerun with adjusted `minClusterSize` if outside.
- **Input scale.** ~1.3 MB / ~325k tokens in one Opus call. Within the 1M context window but expensive. Mitigation: pre-cache the static system prompt; accept the one-shot cost.
- **Trim contamination carryover.** `agent-916a` contributed leg-2 work that touched some of the 13 corpus issues. The super-agent inherits those lessons. May inflate scores at high-size end vs trim baseline. Mitigation: explicit caveat in the writeup; the matched-size comparison with agent-916a is still apples-to-apples (same contamination on both sides).
- **K=1 variance.** Per-cell judge variance σ ≈ 8 quality points. With K=1 and n=36 samples, residual SE is materially better than the original 18-sample plan but still requires leave-out-N-outliers refit.
- **Degree=3 over-fit.** 4 free parameters on 36 samples → df=32, much harder to over-fit than the n=18 case. AIC penalty `2·(degree+1)` ranks lower-degree forms better when residual reduction is small; report `rSquaredAdjusted` alongside R².
- **Per-leg drift.** With 6 legs run sequentially over hours, model behavior can drift (Anthropic side-loads, off-peak / on-peak scheduler differences). Mitigation: per-leg sanity sub-fit (Phase E step 6) flags any single leg whose residuals are unusually large.
- **Cost overrun**. n=36 trims at $1.40/cell ≈ $655 dispatch (vs $330 at n=18). The 6-leg checkpoint structure is the main cost defense — operator can abort after leg 1 if the sweep reveals systematic issues.

## Verification

- **Super-agent build correctness**: grep super-agent CLAUDE.md for ≥1 known H2 from each of 5 random contributors (e.g. agent-916a `## Specialization scope`); contributor count printed by build script matches manual filter count from registry.
- **Trims reproducibility**: rerun `build-super-trims.cjs` with same `seedBase`; `diff` each trim against its predecessor — identical bytes confirm Mulberry32 determinism.
- **Dispatch isolation**: per-agent worktree races prevented by `dispatchCells`'s `inFlightAgents` set; grep cell logs for "branch already exists" / "worktree locked" — should be zero.
- **Regression sanity**: degree=1 + identity should reproduce the existing leg-1 / leg-2 numbers when fed the existing trim baseline samples (not super-agent samples) — regression test for the AIC sweep code.
- **End-to-end smoke**: 1 super-trim × 1 issue × K=1 cell → log + diff captured + score files written → combiner emits a single-sample regression (degenerate but errors clean).
- **Per-leg checkpoint**: after dispatching leg 1 (78 cells), inspect cell-cost distribution + per-issue Q variance against the curve-redo baseline before committing to legs 2-6. Mean cost per cell within 1.5× of the curve-redo-baseline mean is the green-light gate.

## Out of scope

- Source edit to `regression.ts` for degree=3 (already supported).
- Re-running the agent-916a trim baseline (existing data is the comparator).
- A larger corpus (13 issues is small but matches the existing baseline; bigger corpus = separate scoping decision).
- Production wiring of the super-agent (this experiment is **measurement only**; whether to deploy it is a follow-up).
