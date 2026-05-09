# Super-agent tailored-per-issue experiment

## Context

Three picker arms ([#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) Jaccard, [#269](https://github.com/szhygulin/vaultpilot-dev-framework/pull/269) naive, [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272) prose-LLM) all tied at −17 quality points vs. trim baseline. The most recent prose-baseline arm dispatched the full-prose LLM picker against the existing pool of pre-evolved specialists; quality matched the other two pickers, cost was ~$0.25/cell higher than naive.

User hypothesis under test here: **build a fresh per-issue agent by subtracting irrelevant H2 rules from `agents/agent-super/CLAUDE.md` (the deduped union of every existing agent's CLAUDE.md, built in [#276](https://github.com/szhygulin/vaultpilot-dev-framework/pull/276)) — the per-issue tailored agent will outperform the prose-baseline picker arm on at least one of (accuracy, cost) at p<0.05.**

The parent super-agent file (`research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md`, 209 KB, 122 H2 sections) is held constant; only the per-issue selection step differs between this arm and the prose-baseline.

## Hypothesis & success criteria

Two one-sided paired Wilcoxon tests (n=13 issues, mean across K=3 replicates per cell), arm = `tailored`, comparator = `prose-baseline` (re-using existing data from [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272)):

| Test | H1 | α | Win condition |
|---|---|---|---|
| Quality | tailored mean Q > prose mean Q (per issue) | 0.05 | p < 0.05 → "more accurate" |
| Cost | tailored mean cost < prose mean cost (per issue) | 0.05 | p < 0.05 → "cheaper" |

**Soft bar** (per user direction): winning on **either** dimension = significant. Both p-values reported unadjusted, with a one-line note that family-wise rate is ~0.0975 if Holm-Bonferroni is preferred when reading.

Secondary descriptive comparisons (no p-test, narrative only): vs trim baseline, vs specialist-redo, vs naive. Re-uses existing leg-1/leg-2 score directories.

## Design decisions (named explicitly)

| Decision | Choice | Rationale |
|---|---|---|
| Comparator | prose-baseline arm only | Same K=3, n=13, paired by issueId; super-agent-curve data is K=1 + varies by random byte-trim, not content-aware selection — answers a different question and the K mismatch makes paired Wilcoxon awkward. |
| Selection mode | **subtractive** (start from full super-agent, drop irrelevant H2s) | Matches user's "dropping rules not needed" framing; subtractive prompts produce better-calibrated keep decisions than additive (lower false-negative rate on edge-case rules). |
| Selection unit | H2 section (one `## ` heading = one rule) | Matches `parseClaudeMdSections()` and the `proposeCompaction` pipeline used to build the super-agent. |
| Selector model | Opus 4.7 (`claude-opus-4-7[1m]`) | Identical to prose-baseline picker model — only the picking *target* differs. |
| Selector caching | Super-agent prose pinned as cached system-prompt prefix; issue body in user message | 209 KB ≈ 52k tokens. Cached read ~10× cheaper than fresh; 13 calls share a single cache write. Selector cost ~$3-5 instead of ~$30 uncached. |
| Per-issue agent identity | 13 fresh `agent-super-tailored-<issueId>` agents | Clean isolation per issue; mirrors the per-issue super-trim convention in the curve study. Snapshot+restore registry around the run. |
| Replicates / corpus | K=3, n=13 (39 cells) | Identical to prose-baseline → direct paired comparison. |
| Coding-cell flags | `--dry-run --no-target-claude-md --skip-summary --no-registry-mutation --capture-diff-path --max-cost-usd 2.00` | Identical to prose-baseline → only the per-issue agent's CLAUDE.md content differs. |
| Coding model | Sonnet 4.6 | Identical to prose-baseline. |
| Empty-selection edge case | Allow it: tailored agent's CLAUDE.md = empty → behaves like naive | Faithful to the selector's judgment; documented as expected outcome for issues where no rule applies. |

## Phase A — Per-issue rule selection (~$3-5, ~13 Opus calls)

**New file**: `research/curve-redo-bundle/super-agent-tailored/select-rules.cjs` (~250 lines).

1. Load `research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md`. Parse via `parseClaudeMdSections()` from `dist/src/agent/split.js`. Build a stable section index: `[{id, heading, body, byteOffset}]`. The `id` is the H2 heading slugified deterministically (e.g., `auto-escalate-secondllmrequired-when-humandecode-source-is-none-opaque-calldata`) — collisions disambiguated with `-2`, `-3` suffixes.
2. Load `research/curve-redo-bundle/corpus.json`. For each of 13 issues, fetch the issue body via `getIssue()` (same path prose-baseline uses).
3. **Selector prompt** (fixed across issues, cached):
   - **System prompt** (cached): role description + super-agent prose, sections labeled `### Section <id>: <heading>` (replacing original `## ` so the prompt structure isn't ambiguous with the LLM's own output). Output schema: JSON array of `{sectionId, decision: "keep"|"drop", reason: string}`. Mandate: explain each `drop` in 1 sentence; explain each `keep` in 1 sentence (so the LLM thinks about both directions, not just defaults to keeping).
   - **User message** (per issue, NOT cached): issue title + body + `decisionClass` from corpus + repo name. Instruction: "decide which sections from the super-agent help with this specific issue."
4. **Anthropic SDK call** with `cache_control: {type: "ephemeral"}` on the system-prompt block. Track per-call cost via `response.usage` (input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens × per-1M rates).
5. **Validate output**:
   - Parse JSON; reject if not a flat array of `{sectionId, decision, reason}` objects.
   - Every section in the super-agent appears exactly once (no missing, no extra).
   - `decision ∈ {"keep", "drop"}`.
   - At least one `keep` OR explicit operator confirmation (the empty-selection case is allowed but flagged in the audit log).
6. **Write outputs**:
   - `research/curve-redo-data/super-agent-tailored/selections.json` — full audit trail: `{issueId, model, costUsd, selections: [{sectionId, decision, reason}]}` for each issue.
   - `research/curve-redo-data/super-agent-tailored/picks-tailored.tsv` — one row per issue, columns: `issueId, agentId (= "agent-super-tailored-{issueId}"), rationale (= "tailored-keep-{N}-of-{122}"), score=0, leg, labels`. Mirrors the column shape of `picks-prose.tsv` so downstream tooling reuses unchanged.

**Cost guardrail**: per-call hard cap `MAX_CALL_USD=2.00` (exits non-zero if any single call exceeds). Aggregate cap `MAX_TOTAL_USD=15.00` — well above expected $3-5 with margin for retry.

**Idempotency**: re-running with the same super-agent file + same corpus skips issues whose `selections.json` entry already exists, unless `--force`. Selections are deterministic-ish (Opus is not seeded; same input ≈ same output but not byte-identical).

## Phase B — Mint per-issue tailored agents (~$0)

**New file**: `research/curve-redo-bundle/super-agent-tailored/build-tailored-agents.cjs` (~150 lines).

1. Read `selections.json` from Phase A.
2. For each issue:
   - Render the per-issue CLAUDE.md = concatenation of super-agent H2 sections marked `keep`, in their original source order (preserves any inter-section dependencies the super-agent's section order encodes).
   - Mint via `mutateRegistry(reg => createAgent(reg, { agentId: "agent-super-tailored-<issueId>", name: "Tailored-<issueId>", tags: ["super-agent-tailored", "issue-<issueId>"] }))`.
   - Write to `agents/agent-super-tailored-<issueId>/CLAUDE.md`.
   - Track sizes in `research/curve-redo-data/super-agent-tailored/sizes.json` for the writeup (Phase F): `{issueId, sectionsKept, bytesKept, percentOfSuperAgent}`.
3. **Snapshot the registry first**: `cp state/agents-registry.json state/agents-registry.snapshot-pre-tailored.json` (per the prose-baseline §11 defense; mirrored here).
4. Pre-create per-agent target-repo clones at `/tmp/tailored-scratch/<issueId>-<repo>` via `prepare-scratch-clones.sh` from the specialist-redo bundle.

**Verification**: every minted agent has a non-empty `CLAUDE.md` (or empty-by-design with operator-acknowledged log entry); registry has 13 new entries with `agent-super-tailored-` prefix; tag `super-agent-tailored` resolves to exactly 13 agents.

## Phase C — Dispatch K=3 against 13-issue corpus (~$45)

**New file**: `research/curve-redo-bundle/super-agent-tailored/dispatch-tailored-parallel.sh` — **thin wrapper** over `research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo-parallel.sh`. Differences:

- `OUT_DIR` defaults to `$REPO_ROOT/research/curve-redo-data/super-agent-tailored`.
- `PICKS` reads from `picks-tailored.tsv` (Phase A output).
- All other behavior identical: 5 parallel slots, K=3, Sonnet 4.6, identical SDK flags, idempotent skip-if-log-exists, scratch-clone round-robin.

**Per-issue agent ↔ issue binding**: `picks-tailored.tsv` maps issueId → `agent-super-tailored-<issueId>`, so each cell dispatches the correct per-issue agent. Cell key shape matches existing convention: `bench-r<replicate>-agent-super-tailored-<issueId>-<issueId>.log` (the `agentId-issueId` pairing in the log filename matches the existing `dispatchCells` regex).

**Smoke leg before full sweep**: dispatch leg 1 only (6 issues × K=3 = 18 cells, ~$15, ~25 min wall). Inspect cell-cost distribution + per-issue Q variance against prose-baseline leg 1. Operator approval before leg 2.

**Cost ceilings**:
- Per-cell: `VP_DEV_MAX_COST_USD=2.00`.
- Per-leg target: ~$15 leg 1 + ~$30 leg 2.
- Aggregate: ~$50 dispatch budget; abort path at $60.

## Phase D — Score (~$10)

**New file**: `research/curve-redo-bundle/super-agent-tailored/score-tailored.sh` — **thin wrapper** over `research/curve-redo-bundle/specialist-redo/score-specialist-redo.sh` with `OUT_DIR=$REPO_ROOT/research/curve-redo-data/super-agent-tailored`. Identical scoring path: `vp-dev research run-tests` for implement+diff cells, `vp-dev research grade-reasoning` K=3 for implement+pushback. Same hidden-test fixtures.

Each leg's score step runs in parallel with the next leg's dispatch.

## Phase E — Combine + Wilcoxon (~$0)

**New file**: `research/curve-redo-bundle/super-agent-tailored/combine-tailored.cjs` (~200 lines, modeled on `specialist-redo/combine-and-compare.cjs`). Deltas vs. the model:

- `BASELINE_PREFIX = "bench-r"` — prose-baseline arm uses the same `bench-r<N>-<agent>-<issue>` log naming as specialist-redo, so we read both arms via the treatment-shaped reader.
- Both arms supply leg-1/leg-2 logs + scores. Pair by `issueId` only (NOT by replicate; we compare mean Q per issue across K=3 → mean Q per issue across K=3 = paired sample of length 13).
- Two one-sided Wilcoxon tests:
  - `wilcoxonSignedRankPaired(dQs, "greater")` — H1: tailored Q > prose Q.
  - `wilcoxonSignedRankPaired(dCosts, "less")` — H1: tailored cost < prose cost.
- Output `comparison.json` with both p-values, Hedges' g for Q, mean dQ / dCost, per-issue table.
- Family-wise rate note rendered in the writeup (not the JSON).
- **Secondary descriptive cross-tab**: also load trim/specialist/naive existing score dirs → render the 5-arm matrix (tailored, prose, trim, specialist, naive). No p-test on those — just `mean(Q)` and `mean(Q) - mean(tailored Q)` per arm for context.

## Phase F — Writeup + PR

**File**: `research/curve-redo-bundle/super-agent-tailored-results.md` + `super-agent-tailored-results.tar.gz` (selections.json, sizes.json, comparison.json, picks-tailored.tsv).

Headline:
- Quality: tailored vs prose mean dQ + Wilcoxon p (one-sided greater).
- Cost: tailored vs prose mean dCost + Wilcoxon p (one-sided less).
- Soft-bar verdict: which dimension(s) crossed p<0.05.
- Secondary 5-arm matrix (tailored vs prose / trim / specialist / naive).

**Selector audit** (subsection): for each issue, which sections were kept (count + IDs), median size of tailored CLAUDE.md across 13 issues, distribution of "keep ratio" (kept_sections / 122).

PR opens on the `study/super-agent-tailored` worktree branched from `origin/main`.

## Critical files

| Path | Role |
|---|---|
| `research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md` | Phase A — input pool (committed, 209 KB) |
| `research/curve-redo-bundle/super-agent/super-agent-build-manifest.json` | Phase A — provenance reference |
| `src/agent/split.ts` (`parseClaudeMdSections`) | Phase A — section parsing (built dist) |
| `src/state/registry.ts` (`mutateRegistry`, `createAgent`) | Phase B — minting |
| `src/agent/specialization.ts` (`agentClaudeMdPath`) | Phase B — write path |
| `research/curve-redo-bundle/corpus.json` | Phase A, C — 13-issue corpus |
| `research/curve-redo-bundle/specialist-redo/{dispatch,score,combine-and-compare}*` | Phases C/D/E — wrappers / model code |
| `research/curve-redo-data/prose-baseline/{logs-leg{1,2},scores-leg{1,2}}/` | Phase E — comparator data |
| `dist/src/research/curveStudy/cellScores.js` (`loadCellScores`, `qualityFromAB`) | Phase E — score loader |
| `dist/src/research/specialistBench/stats.js` (`wilcoxonSignedRankPaired`, `hedgesG`) | Phase E — Wilcoxon |

## Risks

- **Selector over-drops core sections.** Subtractive bias toward keeping is a known LLM tendency, but the explicit `keep` rationale requirement could backfire — if Opus reads the system prompt as "you must justify each kept section," it may drop borderline sections to avoid low-confidence justifications. Mitigation: per-issue keep-ratio printed at Phase A end; if median ratio < 5/122, abort and re-prompt with a softer mandate.
- **Selector cost variance.** 209 KB cached = $0.04 cache write + $0.001 cache read per call. Total 13-call selector cost should land at $1-3, not $5+. If a single call exceeds $1.50 (12% of expected total), pause and inspect — likely indicates the cache isn't warming.
- **Per-issue agent contamination via super-agent's inherited lessons.** The super-agent was built from `agent-916a` and 46 other contributors; `agent-916a` worked the leg-2 issues originally → some sections name those issues directly. The tailored arm inherits this contamination identically to the prose-baseline arm, so the paired comparison is still apples-to-apples. Documented in caveats.
- **Empty-selection issues.** If Opus drops every section for some issue (e.g., #156 dependency-tracker pushback), that issue's tailored agent ≡ naive. This is the *correct* selector behavior, but means tailored Q for that issue ≈ naive Q for that issue. Documented as expected outcome; don't treat as a bug.
- **Cell cost-cap exhaustion mirror.** Issue #185 burned 3/6 super-trim seeds at the per-cell $2 cap in leg-1 of the curve study. A small tailored CLAUDE.md (low keep-ratio) faces the same risk. Mitigation: same per-cell cap as prose-baseline; cap-hit cells score as 0 quality with non-zero cost — same dataset shape.
- **Statistical power.** n=13 paired Wilcoxon at α=0.05 detects effects of ~0.7-0.8 SD reliably. The prose-baseline arm's per-issue dQ stdev was ~12 points; detecting tailored vs prose at p<0.05 needs |mean dQ| ≥ 8-10 points. Smaller effects fail the test even if real.

## Verification

- **Selector idempotency**: re-running `select-rules.cjs` without `--force` should print `skip (selections.json exists)` for each issue and exit $0 with $0 spent.
- **Section count invariant**: each `selections.json` entry has exactly 122 entries (matching super-agent H2 count); `keep + drop = 122` for every issue.
- **Mint reproducibility**: re-running `build-tailored-agents.cjs` should produce byte-identical CLAUDE.mds (deterministic source-order concatenation).
- **Empty-selection smoke**: feed a synthetic `selections.json` with zero `keep`s for issue #156; Phase B should write an empty `agents/agent-super-tailored-156/CLAUDE.md` (not crash) and Phase C should still dispatch (the spawn doesn't require a non-empty per-agent file).
- **Combine empty-set smoke**: feed `combine-tailored.cjs` an empty score directory → it should emit `comparison.json` with `pairedIssueCount: 0` and `wilcoxon: null` rather than `Infinity` / `NaN` (per local CLAUDE.md "smoke-test the empty-result path" rule).
- **End-to-end smoke**: 1 tailored agent × 1 issue × K=1 cell → log + diff captured + score files written → combiner emits a single-sample regression (degenerate but errors clean).

## Out of scope

- **Modifying the super-agent CLAUDE.md** ("parent agent is not modified yet"). Phase 2 of this initiative if tailored wins.
- **Production wiring of per-issue rule selection into the dispatcher.** This experiment is measurement-only; whether to deploy is a follow-up.
- **Larger corpus.** 13 issues mirrors prose-baseline directly; bigger corpus is a separate scoping decision.
- **K>3 replicates.** Identical to prose-baseline so the paired comparison stays clean.
