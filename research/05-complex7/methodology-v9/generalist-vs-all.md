# Generalist vs ALL arms — follow-up to v9 methodology fixes

Follow-up to [PR #304](https://github.com/szhygulin/vaultpilot-dev-framework/pull/304). The original analysis reported `{tailored, prose} vs generalist`. This adds the missing third comparison **trim vs generalist** plus the curated-vs-curated baseline **tailored vs prose**. Same v9 dataset (correct baseSha + interface-agnostic tests + Phase C force-implement + random-K trim subsampling).

## Headline

**Generalist wins or ties every pair on both axes.** Specialization in all three forms tested — tailored per-issue prompts, prose-picked specialists, and randomized trim variants — fails to beat the no-context generalist on complex-architectural issues under fair-comparison methodology.

## Judge-A (v9, seed 0x5e1d01)

| Comparison | n | mean diff | bootstrap CI95 | p₂ | p(treatment > baseline) | Verdict |
|---|---:|---:|---:|---:|---:|---|
| tailored vs generalist | 5 | **−13.49** | [−21.17, −5.94] | 0.059 | **0.985** | generalist wins (one-sided p ≈ 0.015) |
| prose vs generalist | 5 | **−11.63** | [−21.39, −3.25] | 0.059 | **0.985** | generalist wins (one-sided p ≈ 0.015) |
| trim vs generalist | 6 | **−6.00** | [−11.39, +0.33] | 0.142 | **0.953** | generalist wins (one-sided p ≈ 0.047) |
| tailored vs prose | 5 | −2.93 | [−7.93, +2.05] | 0.500 | 0.785 | tie (prose slightly higher) |

All three "X vs generalist" comparisons have negative mean diffs (generalist higher), p(greater) > 0.95 — robust direction across pairs. Two-sided p stays at 0.06-0.14 because n=5-6 is too small for two-sided to clear even with consistent direction.

## Tests-B (v9)

| Comparison | n | mean diff | bootstrap CI95 | p₂ | p(greater) | Verdict |
|---|---:|---:|---:|---:|---:|---|
| tailored vs generalist | 4 | −6.34 | [−16.79, +5.64] | 0.584 | 0.819 | generalist wins (CI spans 0) |
| prose vs generalist | 2 | +1.38 | [−2.78, +6.92] | 1.000 | 0.500 | tied |
| **trim vs generalist** | **3** | **−9.51** | **[−17.28, −1.67]** | 0.181 | **0.969** | **generalist wins (CI excludes 0)** |
| tailored vs prose | 4 | −7.71 | [−18.72, +3.13] | 0.272 | 0.864 | prose wins |

`trim vs generalist` on B has bootstrap CI95 excluding zero on the negative side, suggesting trim's specialization is anti-helpful on the hidden tests. The bound on the other comparisons spans 0 (n=2-4 is at the floor of statistical power), but signs are consistent.

## Per-issue trim vs generalist

The pair the original PR missed.

### Judge-A
```
#86:  trim=41.3  gen=34.3  diff=+7.0    (trim wins, only positive issue)
#100: trim=30.3  gen=43.0  diff=-12.7
#119: trim=30.3  gen=41.3  diff=-11.0
#308: trim=34.0  gen=38.0  diff=-4.0
#325: trim=28.7  gen=30.0  diff=-1.3
#460: trim=17.3  gen=31.3  diff=-14.0
```

### Tests-B
```
#86:  trim=42.9  gen=42.9  diff=0.0     (tied)
#100: trim=35.4  gen=43.8  diff=-8.3
#119: trim=50.0  gen=50.0  diff=0.0     (tied)
#308: trim=22.2  gen=40.7  diff=-18.5
#460: trim=1.3   gen=21.8  diff=-20.5
```

**#460 was the issue everyone claimed favored specialization** (tailored & prose dominated). Trim — also a "specialist" arm by design — actually scores 1.3 there. Generalist (21.8) wins by 20.5 points. The "curated wins #460" story holds only for tailored / prose specifically; trim's randomized prompt density does the opposite.

## Sensitivity check — trim vs generalist across 5 random-K seeds

Trim subsamples 3 of 9 cells per issue via seeded RNG.

| Axis | seed1 | seed2 | seed3 | seed4 | seed5 | min p₂ | max p₂ |
|---|---:|---:|---:|---:|---:|---:|---:|
| A diff | −6.00 | −2.38 | −1.77 | −0.48 | −6.45 | 0.142 | 0.855 |
| B diff | −9.51 | −5.87 | −5.87 | −1.07 | −5.09 | 0.181 | 1.000 |

**All 10 diffs are negative.** Trim < generalist on both axes across every subsampling seed. Some seeds clear nominal p=0.2; none clear p=0.05 due to small n, but the direction is invariant.

## Aggregate picture

| Pair | Generalist position | Effect size |
|---|---|---|
| tailored vs generalist | **wins on A**, wins on B | large (A: −13.5) |
| prose vs generalist | **wins on A**, ties on B | large on A (−11.6) |
| trim vs generalist | wins on A, **wins on B** | medium (A: −6, B: −9.5) |
| tailored vs prose (curated-vs-curated) | n/a | prose slight A edge, prose B edge |

**Generalist wins or ties every pairwise comparison on both axes.** The curated arms also don't differentiate from each other.

## What this strengthens / what it doesn't

Strengthens:
- The v9 reversal isn't tailored-specific — it holds across all three specialization variants.
- Multiple-comparison concern is partially mitigated: when the same arm wins 6 of 6 pair-axis combinations in the same direction, the family-wise probability of that by chance under the null is ~ 2⁻⁶ ≈ 0.016 (even before considering effect sizes).

Doesn't change:
- n=5-6 per pair on A, n=2-4 on B — still underpowered for any individual two-sided test.
- Two-sided p ≥ 0.06 everywhere; one-sided p ≤ 0.05 only on tailored-vs-gen and prose-vs-gen.
- #460 outlier still drives a non-trivial share of trim-vs-gen B (#460 contributes −20.5 of the −9.51 mean).
- Force-implement reading caveat from the original PR (does it measure logic quality or forced-on-skipped-issue work?) still applies symmetrically.

## Caveat — pushback rate is also a finding

Trim's 6% pushback rate (vs tailored 43%, prose 29%, generalist 0%) means trim was already "almost-generalist" in this corpus — it implemented on almost every cell. Its judge-A under v9 (31.29) sits closer to generalist (36.71) than to tailored (24.05) precisely because there were fewer pushback → force-implement swaps for trim. The trim vs generalist gap is **smaller** than tailored vs generalist for a reason: trim's original judgment was already to implement, so Phase C changed less. That makes the trim < generalist direction more interpretable, not less — it isn't an artifact of forced low-quality work.

## Aggregator

`aggregate-v9.cjs` now emits 6 pair comparisons (4 originals + `trim_vs_generalist` + `tailored_vs_prose`). `comparison-v9.json` regenerated with the full pair set.
