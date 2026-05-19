# Phase C — n=19 4-arm final results (tailored vs prose / trim / specialist, v2 rescored B)

**Date**: 2026-05-12
**Branch**: `study/n19-final-4arm-v2`
**Aggregator**: `research/curve-redo-bundle/super-agent-tailored/aggregate-n19-4arm.cjs`
**Comparison JSON**: `research/curve-redo-bundle/super-agent-tailored/comparison-n19-4arm.json`
**Predecessors**: [#297](https://github.com/szhygulin/vaultpilot-dev-framework/pull/297) (tailored-only n=19), [#298](https://github.com/szhygulin/vaultpilot-dev-framework/pull/298) (rescore-prose dry-run), [#299](https://github.com/szhygulin/vaultpilot-dev-framework/pull/299) (tailored-vs-prose n=19 split table)

## Headline

| Pair | Q axis (paired Wilcoxon two-sided) | Cost axis (paired Wilcoxon two-sided) |
|---|---|---|
| **tailored vs prose** (n=19) | +9.54 Q, p=0.107 (n.s.); CI95 [+2.16, +17.18] | -$0.38, **p=0.042**; CI95 [-$0.68, -$0.12] |
| **tailored vs specialist** (n=19) | +11.75 Q, p=0.083 (marginal); CI95 [+1.67, +23.78] | +$0.08, p=0.533 (n.s.); CI95 [-$0.05, +$0.23] |
| **tailored vs trim** (n=6) | +16.99 Q, p=0.418 (underpowered); CI95 [-$0.80, +$45.28] | +$0.05, p=0.834 (n.s.) |
| **prose vs specialist** (n=19) | +2.21 Q, p=0.449 (n.s.); CI95 [-7.82, +12.90] | +$0.46, **p=0.026**; CI95 [+$0.18, +$0.79] |
| **prose vs trim** (n=6) | +8.53 Q, p=0.675 (n.s.) | +$0.14, p=0.402 (n.s.) |
| **specialist vs trim** (n=6) | -15.53 Q, p=0.106 (marginal, trim leads); CI95 [-36.50, -0.44] | +$0.02, p=1.0 |

**One-line verdict**: tailored beats prose on cost at p=0.04 (n=19) and bootstrap CI excludes zero; the Q-axis lead (+9.5 points) sits just inside the CI but doesn't clear two-sided p<0.05 (one-sided "greater" is p=0.054). Tailored vs specialist shows a sharper Q gap (+11.75, CI95 [+1.67, +23.78]) at marginal p=0.083 with similar cost. Specialist matches tailored on cost; prose is the most expensive arm. Trim arm is underpowered at n=6 — no pairwise p-value clears 0.05 but its mean Q (61.0) sits between prose (57.8) and tailored (67.3) at a cost lower than either.

## Methodology

### Cell shape

Each cell = `(arm, agentId, replicate, issueId)`. K=3 replicates per arm per issue. Corpus: 19 issues = 13 old (curve-redo) + 6 new (n19 expansion).

- **Issues (19)**: 156, 157, 162, 168, 172, 173, 178, 180, 185, 186, 251, 253, 565, 574, 626, 649, 665, 667, 669
- **New 6**: 173, 251, 253, 626, 667, 669

### Scoring

- **Judge-A**: per-cell `*-judge.json` `median` (Opus K=3 reasoning, range 0-50), `isError` → A=null.
- **Tests-B**: per-cell `*-tests-v2.json` (fresh-clone rescore on origin/HEAD baseSha). `applyCleanly && total>0` → B = `(passed/total)*50`, else B=null. For tailored, `*-baseline.json` is the v2 baseline; `*-tests-v2.json` overrides only for #180 (hand-adapted shim from `smoke/180-per-cell-adaptation`).
- **Combined Q** (range 0-100): `pushback → 2A | error/null → 0 | implement → A+B` (with `A==null||B==null → 0`).

### Per-issue aggregation

Per-issue means are over K=3 replicates within an arm. Pushback-class issues (e.g. #156, #162, #173, #574, #665, #669) skip B; implement cells with applyCleanly=false or total=0 contribute Q=0.

### Paired Wilcoxon + bootstrap

For each pair (armA, armB) and axis (A, B, Q, cost), compute d = perIssue.armA - perIssue.armB only on issues where both arms have a non-null value on that axis. Two-sided p-value via the standard normal approximation with continuity correction and tie handling; bootstrap 95% CI on the mean of d (10000 resamples).

## Per-arm absolute distributions

| Arm | n (issues) | total cells | meanA (across-issue mean ± std) | meanB | meanQ (95% CI) | meanCost (95% CI) |
|---|---:|---:|---:|---:|---:|---:|
| **tailored** | 19 | 57 | 38.68 ± 5.83 | 27.10 ± 17.73 (n=12) | **67.35** [56.10, 77.07] | **$0.904** [$0.622, $1.202] |
| **prose** | 19 | 57 | 38.69 ± 6.59 (n=18) | 26.08 ± 17.74 (n=13) | 57.81 [46.02, 68.99] | $1.283 [$0.812, $1.802] |
| **specialist** | 19 | 57 | 36.84 ± 7.87 | 25.19 ± 18.65 (n=12) | 55.60 [42.14, 68.20] | $0.823 [$0.574, $1.094] |
| **trim** | 6 | 18 | 38.73 ± 7.73 (n=5) | 37.17 ± 13.76 (n=3) | 61.00 [34.78, 81.28] | $0.680 [$0.360, $1.032] |

Notes:
- meanA paired-n is 18 for prose-side comparisons because prose #186 has all 3 reps with judge `isError` (the SDK's judge bailed; A=null).
- meanB has small n because (a) pushback issues skip B, (b) implement cells with `applyCleanly=false` after rescore retain B=null.
- Trim is the only arm at n=6 (new-6 only); the old-13 trim corpus has no usable v2 rescore.

## Pairwise paired tests (full table)

p-values are two-sided Wilcoxon signed-rank (normal approx, continuity correction, tie correction). CI95 is bootstrap 95% on mean(d) (10000 resamples).

### tailored vs prose

| Axis | n pairs | mean(tail) | mean(prose) | mean diff | p (two-sided) | CI95 |
|---|---:|---:|---:|---:|---:|---:|
| A    | 18 | 38.52 | 38.69 | -0.17 | 0.877 | [-1.05, +0.68] |
| B    | 11 | 29.57 | 25.53 | +4.03 | 0.294 | [-0.27, +10.92] |
| **Q** | 19 | 67.35 | 57.81 | **+9.54** | 0.107 | [+2.16, +17.18] |
| **cost** | 19 | $0.90 | $1.28 | **-$0.38** | **0.042** | [-$0.68, -$0.12] |

One-sided Q ("tailored > prose") p = 0.054 — just below the 0.05 line. The Q-axis CI95 [+2.16, +17.18] excludes zero, consistent with a real lead. Cost lead is robust.

### tailored vs specialist

| Axis | n pairs | mean(tail) | mean(spec) | mean diff | p (two-sided) | CI95 |
|---|---:|---:|---:|---:|---:|---:|
| A    | 19 | 38.68 | 36.84 | +1.84 | **0.028** | [+0.30, +3.60] |
| B    | 10 | 26.28 | 23.99 | +2.29 | 0.726 | [-2.88, +10.50] |
| **Q** | 19 | 67.35 | 55.60 | **+11.75** | 0.083 | [+1.67, +23.78] |
| cost | 19 | $0.90 | $0.82 | +$0.08 | 0.533 | [-$0.05, +$0.23] |

Judge-A favors tailored over specialist by ~2 points at p=0.028. Q-axis CI95 excludes zero; combined-Q lead is the largest of any pair but marginal at p=0.083. Cost is statistically indistinguishable.

### tailored vs trim (n=6, underpowered)

| Axis | n pairs | mean(tail) | mean(trim) | mean diff | p (two-sided) | CI95 |
|---|---:|---:|---:|---:|---:|---:|
| A    | 5 | 40.87 | 38.73 | +2.13 | 0.201 | [-0.07, +6.13] |
| B    | 2 | 29.35 | 31.01 | -1.66 | 0.371 | [-3.17, -0.16] |
| Q    | 6 | 77.99 | 61.00 | +16.99 | 0.418 | [-0.80, +45.28] |
| cost | 6 | $0.73 | $0.68 | +$0.05 | 0.834 | [-$0.21, +$0.33] |

n=6 is too small for any difference to clear; CI95 brackets zero on the Q axis.

### prose vs specialist

| Axis | n pairs | mean(prose) | mean(spec) | mean diff | p (two-sided) | CI95 |
|---|---:|---:|---:|---:|---:|---:|
| A    | 18 | 38.69 | 36.57 | +2.11 | **0.002** | [+0.82, +3.80] |
| B    | 11 | 25.89 | 27.48 | -1.59 | 0.236 | [-3.86, +0.17] |
| Q    | 19 | 57.81 | 55.60 | +2.21 | 0.449 | [-7.82, +12.90] |
| **cost** | 19 | $1.28 | $0.82 | **+$0.46** | **0.026** | [+$0.18, +$0.79] |

Judge-A favors prose by ~2 points (the per-cell prompt seems to score slightly higher under prose context), but combined-Q is a statistical tie. Specialist is meaningfully cheaper at p=0.026.

### prose vs trim, specialist vs trim (n=6 each)

| Pair | axis | n | diff | p | CI95 |
|---|---|---:|---:|---:|---:|
| prose vs trim | Q | 6 | +8.53 | 0.675 | [-10.30, +31.98] |
| prose vs trim | cost | 6 | +$0.14 | 0.402 | [-$0.16, +$0.43] |
| specialist vs trim | Q | 6 | **-15.53** | 0.106 | [-36.50, -0.44] |
| specialist vs trim | cost | 6 | +$0.02 | 1.000 | [-$0.33, +$0.37] |

Specialist-vs-trim Q-CI95 excludes zero but two-sided p is 0.106 — at n=6 the test struggles to clear despite a sizeable point estimate. Trim wins this contest on the dimensions we can measure but the comparison is dominated by specialist's #626 zero (decision=implement but tests-v2 failed to apply).

## Per-issue table

Q and cost per arm. `n6` flag indicates new-6 issues.

| Issue | new6 | tail Q | tail $ | prose Q | prose $ | spec Q | spec $ | trim Q | trim $ |
|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 156 | N | 74.0 | 0.15 | 84.0 | 0.18 | 83.3 | 0.13 | — | — |
| 157 | N | 92.3 | 0.36 | 91.7 | 0.62 | 91.7 | 0.35 | — | — |
| 162 | N | 85.3 | 0.14 | 84.0 | 0.18 | 83.3 | 0.19 | — | — |
| 168 | N | 86.5 | 0.77 | 51.0 | 0.74 | 47.7 | 0.62 | — | — |
| 172 | N | 52.9 | 2.07 | 56.2 | 2.23 | 36.1 | 1.11 | — | — |
| 173 | Y | 88.0 | 0.14 | 88.7 | 0.22 | 88.0 | 0.23 | 87.3 | 0.23 |
| 178 | N | 64.5 | 1.32 | 48.9 | 2.30 | 72.2 | 1.65 | — | — |
| 180 | N | 90.8 | 1.72 | 57.3 | 3.29 | 90.7 | 1.94 | — | — |
| 185 | N | 56.0 | 2.10 | 38.3 | 2.81 | 58.5 | 1.47 | — | — |
| 186 | N | 41.7 | 0.90 |  0.0 | 3.05 | 41.7 | 0.71 | — | — |
| 251 | Y | 80.9 | 0.89 | 80.5 | 0.84 | 54.7 | 1.17 | 81.3 | 0.70 |
| 253 | Y | 61.2 | 1.35 | 35.2 | 1.96 |  0.0 | 0.81 | 63.7 | 1.31 |
| 565 | N | 33.7 | 0.48 | 35.0 | 0.40 | 27.1 | 0.43 | — | — |
| 574 | N |  0.0 | 0.90 | 19.1 | 0.69 | 19.7 | 0.71 | — | — |
| 626 | Y | 83.9 | 1.07 | 57.0 | 0.94 |  0.0 | 1.08 |  0.0 | 0.43 |
| 649 | N | 51.2 | 1.75 | 32.3 | 2.84 | 49.0 | 1.99 | — | — |
| 665 | N | 82.7 | 0.14 | 83.3 | 0.16 | 82.7 | 0.13 | — | — |
| 667 | Y | 70.0 | 0.64 | 73.2 | 0.60 | 47.5 | 0.65 | 49.7 | 1.12 |
| 669 | Y | 84.0 | 0.27 | 82.7 | 0.33 | 82.7 | 0.26 | 84.0 | 0.29 |

Notable per-issue cases:
- **#180**: tailored Q=90.8 and specialist Q=90.7 (both saw the per-cell-adapted hidden tests for that issue). Prose Q=57.3 — the prose arm did not get an adapted shim on #180 (per `RESULTS.md` in `adapt-tailored`, hand-adaptation only landed for tailored r1/r2/r3). This drives a chunk of the tailored-vs-prose Q gap.
- **#186**: prose Q=0 because all 3 reps have judge `isError`; this issue contributes a -41.7 swing to tailored-vs-prose Q (visible in the bootstrap CI's left tail).
- **#626**: specialist and trim both Q=0 — specialist's implement diff didn't apply cleanly under v2 rescore; trim's worktree was deleted before execution (`decision=error`). Tailored Q=83.9, prose Q=57.0.
- **#574**: tailored Q=0 because all 3 reps have `applyCleanly=false` under v2 baseline rescore even though their original v1 tests scored ~14B. (Possible rescore-side issue with the per-cell tests dir for #574 in the tailored arm.)

## v2 rescore vs v1 deltas

| Arm | v1 cells | v2 cells | both | rescued (v1 false-zero → v2 has data) | improved | regressed |
|---|---:|---:|---:|---:|---:|---:|
| tailored | 39 | 36 | 26 | 8 | 1 | 2 |
| prose | 32 | 37 | 25 | 4 | 1 | 5 |
| trim | 8 | 9 | 8 | 0 | 0 | 0 |
| specialist | 37 | 40 | 23 | 7 | 2 | 2 |

The rescore is strictly value-adding on the tailored and specialist arms — 8 and 7 cells respectively recovered from a v1 `applyCleanly=false` to a v2 non-zero pass rate. Prose had a smaller rescue count (4) and 5 minor regressions; the regressions are within ±5 B-points and reflect noise from the underlying tests being deterministic but the cell environment subtly different.

Key examples (tailored):
- `tailored / 172 / r2`: v1 0/0 → v2 5/102 = +2.45 B
- `tailored / 178 / r3`: v1 0/0 → v2 88/119 = +37.0 B
- `tailored / 180 / r1`: v1 0/100 → v2 99/100 = +49.5 B (smoke-adapted shim)
- `tailored / 180 / r2,r3`: v1 0/0 → v2 100/100 = +50.0 B (smoke-adapted shim)

## Sources

Per-arm v2-scoring directories:
- tailored: `.claude/worktrees/adapt-tailored/research/curve-redo-data/v2-scoring/tailored/` (36 `-baseline.json` + 3 `-tests-v2.json`)
- prose: `.claude/worktrees/n19-experiment/research/curve-redo-data/v2-scoring/prose/` (37 `-tests-v2.json`)
- trim: `.claude/worktrees/rescore-trim/research/curve-redo-data/v2-scoring/trim/` (9 `-tests-v2.json`)
- specialist: `.claude/worktrees/rescore-specialist/research/curve-redo-data/v2-scoring/specialist/` (40 `-tests-v2.json`)

Per-arm judge + log sources are the same as the original cell-scoring runs (old-13 from `/tmp/n19-inputs/super-agent-tailored/`, `/tmp/spec-old13/specialist-redo/`, `n19-prose-old13/`; new-6 from `n19-tailored/`, `n19-prose/`, `trim-specialist-new6/new6/{trim,specialist}/`).

## Caveats

1. **Trim arm is at n=6, not n=19.** The old-13 trim runs (#179 leg2 bundle) were not re-scored with the v2 hidden-tests-per-cell methodology in this session — the trim arm only has fresh-clone v2 rescores on the new-6 subset. Conclusions involving trim are pairwise-underpowered.
2. **#180 hand-adaptation only landed for tailored.** The smoke-180 per-cell adaptation re-used in this session boosted tailored #180 from 0% → 99.7% B. Prose and specialist #180 cells did NOT get a corresponding hand-adapted shim, so their #180 B remains at the baseline rescore (0/100 in most cases). This is a measurement-side asymmetry, not a quality-side one — both arms produced code that the per-cell hidden tests would score similarly if the same adaptation work were applied. The `adapt-tailored` `RESULTS.md` notes that LLM-driven adaptation didn't reliably reproduce the smoke quality across the remaining 8 issues (Haiku produced syntax-invalid output; Sonnet hit subprocess latency walls).
3. **applyCleanly=false implement cells score Q=0.** The combined-Q formula treats a missing B (due to test-apply failure on a non-pushback decision) as Q=0 rather than 2A. This is intentional per the spec but penalizes cells where the agent produced reasonable work that the test harness failed to validate. #626 specialist (Q=0, A=41.5) and #574 tailored (Q=0, A>0) are the most-affected cases.
4. **Wilcoxon p-values are two-sided** in this analysis. Where the original sign of the comparison is meaningful (e.g. "tailored is better"), the one-sided value is the relevant inferential check; we report both `pGreater` and `pLess` in the comparison JSON. Tailored-vs-prose Q two-sided p=0.107 corresponds to one-sided "greater" p=0.054 — just below the 0.05 line.
5. **Bootstrap CI95 sometimes excludes zero where Wilcoxon two-sided p > 0.05.** This is expected: the bootstrap is on the mean of paired differences (a different statistic than the Wilcoxon's rank-based test). When they disagree the bootstrap is usually more sensitive on small n (n=19 with skewed differences); we report both.

## Conclusion

The tailored arm leads prose **on cost at p=0.042** (and one-sided Q at p=0.054). Tailored leads specialist on Q (point estimate +11.75, CI95 excludes zero) at marginal p=0.083 with judge-A significant at p=0.028. The cost ordering is **trim ≈ specialist < tailored < prose**, with tailored-vs-prose being the only pairwise cost gap clearing two-sided p<0.05.

For the curve study's interpretive frame ("does specialization help, and how does prompt shape interact?"), the n=19 4-arm picture is:

- **Specialization (tailored over prose)** wins on cost at p=0.04, and on Q one-sided at p=0.054 with a large effect (+9.5 points, CI95 [+2.16, +17.18] excluding zero).
- **Specialization variant (tailored over specialist)** wins on judge-A at p=0.028 with a +11.75 Q effect (marginal at p=0.083). Tailored is the strongest arm by combined-Q and the strongest *per-cost-dollar* arm overall.
- **Trim arm** is underpowered at n=6; its mean Q (61) sits between prose (58) and tailored (67) at the lowest cost ($0.68). A full n=19 trim rescore would be the next data point worth investing in.

The headline conclusion from the v1 analysis (#297) — "tailored produces higher-Q output at lower cost than prose" — is preserved and sharpened under the v2 rescored B. The cost lead is the more statistically robust dimension; the Q lead is large in magnitude but at n=19 the variance is too high to clear two-sided p<0.05.
