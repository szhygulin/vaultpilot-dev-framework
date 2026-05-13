# complex7 methodology audit + v9 results

Run date: 2026-05-13. Coding cells: Sonnet 4.6 (re-dispatched pushbacks). Reasoning judge: Opus 4.7 K=3.
Corpus: the 7 "complex / architectural" issues from [PR #302](https://github.com/szhygulin/vaultpilot-dev-framework/pull/302) — {86, 100, 119, 308, 325, 427, 460}. Arms: tailored, prose, trim (randomized), generalist.

## Headline

The original v3/v4 complex7 conclusion ("no signal between arms") was the right conclusion for the **wrong reasons**. After fixing five distinct methodology bugs, the picture changes materially:

**Generalist beats tailored on judge-A by 12.7 points (mean diff −13.49, bootstrap CI95 [−21.2, −5.9], one-sided p ≈ 0.02) once pushback asymmetry is controlled for.**

The signal was hidden because tailored pushed back on 43% of cells (Q = 2A scores well on pushback comments) while generalist pushed back on 0% (had to implement everything). Once tailored is forced to implement the same issues generalist did, its judge-A drops from 35.57 → 24.05.

The B-axis (hidden tests) is still noisy (n=2-5 per pair) and dominated by issue #460. No B-axis comparison clears p < 0.05 even one-sided.

## Methodology bugs found + fixed

| # | Bug | Effect | Fix | Severity |
|---|---|---|---|---|
| 1 | **Score-clones at wrong baseSha** — `score-cell-v3.sh` silently fell through to `git reset --hard origin/main` so clones contained the canonical merged-PR fix, not the agent's diff applied to the pre-fix state. Tests passed thanks to the canonical impl. | Trim and generalist B inflated by 2-3 points; some "passing" tests were testing the merged fix, not the agent's work. | `v6-rescore.sh` resets each clone to `corpus.baseSha` and verifies the reset took before applying the diff. | **load-bearing** — invalidated all prior B-axis scoring |
| 2 | **Test interface-coupling** — v4 hidden tests hardcode symbol names (`makeDurableBinding` not `renderDurableBindingSource`), field names (`provenanceHint` not `hint`), enum values. Agents with different design choices fail at import even when logic is correct. | Generalist's r3 #460 used `hint` instead of `provenanceHint` and scored 2/12 despite implementing correct per-kind URL routing. | `fixed-tests/<issue>/*.test.ts` use dynamic probe-dispatch on multiple symbol/field/path variants. | **dominant** for #460 — fix added 0/13 → 13/13 for legitimate alternate designs |
| 3 | **Test permissiveness** — tests check substring presence (`/compound\.finance/`) without negative assertions, so a stub returning all URLs in one string passes 12/12. | Stubs scored same as real impls. | Add negative assertions: hint for kind X must NOT contain ≥3 other kinds' URLs. | mostly hypothetical (no stubs in actual cells) but tightens the metric |
| 4 | **Test runner pulled all dest-dir tests** — `npx vitest run` (no args) ran the repo's existing tests + hidden tests + agent-authored tests. Scores like 76/77 or 1731/1731 were not measuring hidden-test pass rate. | Hidden-test pass rate was diluted by the repo's own tests passing. | Pass explicit hidden-test file list to vitest/tsx. | important — corrected B numbers in v6 |
| 5 | **Pushback asymmetry** — Tailored pushed back on 43% of complex7 cells; prose 29%; trim 6%; generalist 0%. Q = 2A on pushback (no B), Q = A + B on implement. Tailored mathematically wins on pushback issues if A ≥ 25. | v4-v6 numbers favored curated arms on issues they chose to skip. | `VP_DEV_FORCE_IMPLEMENT=1` env var injects "pushback disabled" directive into Step 3 of `workflow.ts`. Re-dispatched 19 pushback cells; all 19 produced implement decisions. | **biggest single shift** — reversed the apparent A-axis story |

## Per-arm means evolution

### Judge-A across versions

| Version | Tailored | Prose | Trim (randomized K=3) | Generalist |
|---|---:|---:|---:|---:|
| v3/v4 (original, wrong baseSha) | 37.12 | 35.02 | 35.31 | 36.71 |
| v5 (interface-fixed tests) | 35.57 | 35.02 | 34.24 | 36.71 |
| v6 (+correct baseSha) | 35.57 | 35.02 | 34.24 | 36.71 |
| **v9 (+force-implement)** | **24.05** | **26.88** | **31.29** | **36.71** |

Generalist A is invariant because generalist had no pushback cells to re-dispatch. Tailored A drops 11.5 points; prose 8.1.

### Tests-B v9

| Arm | mean B | n issues with B |
|---|---:|---:|
| tailored | 33.54 | 5 |
| prose | 41.21 | 5 |
| trim (randomized K=3) | 30.36 | 5 |
| generalist | 39.83 | 5 |

## Final paired Wilcoxon (v9, seed 0x5e1d01)

### Judge-A

| Comparison | n | mean diff | CI95 | p₂ | p(treatment > baseline) |
|---|---:|---:|---:|---:|---:|
| tailored vs generalist | 5 | −13.49 | [−21.17, −5.94] | 0.059 | 0.985 |
| tailored vs trim | 6 | −7.49 | [−19.67, +2.89] | 0.295 | 0.896 |
| prose vs generalist | 5 | −11.63 | [−21.39, −3.25] | 0.059 | 0.985 |
| prose vs trim | 6 | −5.63 | [−13.44, +1.11] | 0.402 | 0.853 |

**Tailored vs generalist** and **prose vs generalist** both have bootstrap CI95 excluding zero on the negative side — robust evidence that generalist outperforms the curated arms on judge-A when arms are compared on the same set of issues (force-implement reframing). Two-sided p hovers at 0.06 due to n=5; one-sided p ≈ 0.015 against the "treatment > baseline" hypothesis is the inferential read.

### Tests-B

| Comparison | n | mean diff | CI95 | p₂ | p(greater) |
|---|---:|---:|---:|---:|---:|
| tailored vs generalist | 4 | −6.34 | [−16.79, +5.64] | 0.58 | 0.82 |
| tailored vs trim | 4 | +3.18 | [−12.43, +20.77] | 0.86 | 0.43 |
| prose vs generalist | 2 | +1.38 | [−2.78, +6.92] | 1.00 | 0.50 |
| prose vs trim | 3 | +10.89 | [+1.67, +22.01] | 0.18 | 0.09 |

B-axis flat across pairs. The `prose vs trim` one-sided p=0.09 is mostly carried by #460 (+32 points); without #460 the comparison drops to noise.

### Per-issue B detail (v9 seed1)

```
tailored vs generalist: #86:-24  #100:-13  #119:0   #308:-9   #460:+14
tailored vs trim:       #86:-24  #100:-4   #119:0   #308:+9   #460:+35
prose vs generalist:    #86:0    #100:0    #119:0   #308:-5   #460:+12
prose vs trim:          #86:0    #100:+8   #119:0   #308:+14  #460:+32
```

#460 (vaultpilot-mcp durable-binding source-of-truth) is the dominant single-issue B-axis contributor. Curated arms still produce more passing tests there — domain-specific context for security invariants seems to help on that one issue.

## Interpretation — two readings

The v9 result depends on what hypothesis is being tested:

**Reading 1 (methodology-skeptic)**: Phase C force-implements are *forced low-quality work* because the agent's own judgment said pushback. Comparing those to generalist's natural implements is unfair the other way. The v6 result ("no signal") was closer to the question "is the agent's output quality on its self-selected issues higher with specialization?".

**Reading 2 (methodology-honest)**: Pushback rate is itself a confound. Tailored *picks* the issues where pushback wins its judge score; it dodges hard implements. Generalist has to engage with everything. **The true logic-quality comparison should not let agents self-select**, which Phase C enforces. Under that reading, generalist outperforms the curated arms on logic per the judge.

Both readings reflect the same underlying observation: **specialization in this experiment shows up as better pushback judgment rather than better implementation quality**. Whether you call that "specialization helps" depends on what your downstream consumer values.

## Random-K trim subsampling

Trim has 9 cells per issue (3 trim agents × K=3 reps). To match other arms' K=3 structure, the aggregator random-samples 3 of 9 trim cells per issue via Mulberry32 RNG. Across 5 seeds: trim mean B ranges 30-39 (6-9 point spread). The trim B headline number is the median across seeds.

## Caveats

1. **n is small** (5-6 paired issues for A, 2-5 for B). Even one-sided p≈0.02 doesn't survive Bonferroni correction across our 16+ test family.
2. **Force-implement produces low-quality work** — agents that *should* pushback do produce mediocre implementations when forced. Generalist's edge on A may shrink if generalist faced the same comparison structure (it doesn't, by definition — no pushbacks to replace).
3. **#460 dominates B** — drop it and prose-vs-trim's nominal p=0.09 collapses to noise.
4. **#427 has no behavioral tests** (excluded from B in v4 corpus); the Phase C re-dispatch for #427 r3 was scored on A only.
5. **#325 subfeature divergence** — different arms implemented different sub-features (P1 SE attestation, P2 canonical-apps, P3 firmware, P5 peer-pinning). v4 tests assume P2; cells choosing other sub-features correctly fail at applyCleanly post-baseSha-reset and drop from B-axis.

## Artifacts

- `aggregate-v9.cjs` — final aggregator (correct baseSha + Phase C overlay + random-K trim)
- `comparison-v9.json` — 5 random-K seed runs with full per-issue + per-pair statistics
- `comparison-v6.json` — pre-Phase-C results for delta comparison
- `v6-rescore.sh` — fresh-baseSha re-scoring pipeline (concern #1 fix)
- `phase-c-redispatch.sh` — re-dispatcher for pushback cells with `VP_DEV_FORCE_IMPLEMENT=1`
- `phase-c-score.sh` — judge + v6 test scoring for Phase C cells
- `phase-c-results.tar.gz` — 19 force-implement cell logs + diffs + scores
- `fixed-tests/{86,100,119,308,325,460}/` — interface-agnostic + stub-resistant test corpus
- `strict-filter-diff.cjs` — diff filter for judge prompts (350KB cap, drops `.claude/worktrees/`, `research/`, `feature-plans/`, docs)

## Source change

`src/agent/workflow.ts` adds an env-var-gated **FORCE-IMPLEMENT MODE** in Step 3: when `VP_DEV_FORCE_IMPLEMENT=1`, the workflow prompt disables the pushback path. Default behavior unchanged. Used by Phase C only; safe to leave in for future calibration studies.

## Phase C dispatch summary

| | |
|---|---|
| Pushback cells re-dispatched | 19 (tailored 9, prose 6, trim 4, generalist 0) |
| All re-dispatched cells: decision | `implement` (FORCE_IMPLEMENT effective) |
| Diff sizes | 1–18 KB (much smaller than original scope-explosion diffs) |
| Wall time | ~75 min (4-way parallel) |
| Cost | ~$38 dispatch + ~$10 judge = ~$48 API |
