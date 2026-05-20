# Does Curating a Coding Agent's CLAUDE.md Improve Code Quality?

*A controlled study of prompt-density and content-specialization effects in an autonomous issue-resolution orchestrator.*

## Abstract

We ask whether curating or specializing the per-agent `CLAUDE.md` memory file an autonomous coding agent carries into each task improves the quality of the code it ships, and at what cost. Across six experimental phases (May 2026) we dispatched Sonnet-4.6 coding agents at GitHub issues, scoring each cell with a falsifiable 0–100 quality metric: an independent Opus-4.7 reasoning judge (A, 0–50) plus a hidden-test pass rate (B, 0–50), so the subject never grades its own output. The accuracy–density curve is quadratic-raw and clears the merge gate (p=0.030, n=18) but the variation is small and non-monotone; token cost rises linearly with size (p<10⁻¹⁸). Three independently designed pickers — Jaccard-tag, fresh-naive, and full-prose-LLM — all land ≈17 quality points *below* a random-trim baseline. A 122-section/209 KB super-agent shows flat quality across 12 sizes while quality-per-dollar drops 2.4×. Per-issue tailored rule selection buys a ≈$0.12/cell cost reduction with no quality gain — the apparent combined-Q "signal" was decision-class composition, not within-class quality. On seven complex-architectural issues, after fixing five measurement bugs, the no-context generalist beats or ties every specialization form (generalist +12.7 judge-A over tailored; bootstrap CI excludes zero). The recurring result: directed specialization of `CLAUDE.md` content does not transfer code quality across agents; the bare/random baseline is hard to beat and its only reliable lever is cost.

---

## 1. Introduction

The orchestrator studied here dispatches autonomous coding agents at GitHub issues: it mints per-issue specialist agents, accumulates a per-agent `CLAUDE.md` memory file that a summarizer rewrites after every successful run, and routes new issues to specialists by tag overlap. The design premise is that an agent which has accumulated relevant lessons in its `CLAUDE.md` will produce better code than a bare agent. **This study tests that premise directly.**

The question has two parts:

1. **Density** — does a larger `CLAUDE.md` (more accumulated rules) produce higher-quality code, and what does the size cost?
2. **Content/specialization** — does *directed* curation (picking the right rules, minting the right specialist, tailoring rules per issue) beat an undirected random subset or a no-context generalist?

The answer matters for the orchestrator's core architecture. If specialization transfers quality, the agent-minting, summarizer, and picker machinery earns its keep. If it does not, that machinery is cost without benefit, and the right default is a bare or randomly-trimmed agent.

**Contributions.**

- A falsifiable quality metric (independent reasoning judge + hidden-test suite) that the subject cannot game, with its measure-of-success rationale and falsifier stated explicitly (§2.2).
- A quadratic accuracy–density curve fit that clears a pre-registered merge gate, plus the model-form sweep that selected it (§4.1).
- A four-arm comparison (trim / Jaccard-picker / naive / prose-LLM-picker) showing all three directed pickers tie ≈17 Q below random trim (§4.2).
- A 12-size super-agent curve isolating a flat quality axis from a linear cost axis and a 2.4× quality-per-dollar loss (§4.3).
- A decision-class-composition decomposition showing the only tailored-selection "quality signal" was an artifact of which issues each arm chose to push back on (§4.4).
- A complex-architectural-issue result, after a five-bug methodology audit, in which the no-context generalist beats or ties every specialization form (§4.5).

The reorganized corpus and dated phase index are in [`research/TIMELINE.md`](TIMELINE.md); raw data and reproducer scripts in [`research/curve-redo-bundle/`](curve-redo-bundle/README.md).

---

## 2. Methodology

### 2.1 Dispatch harness

The orchestrator dispatches a coding agent against a `--target-repo` issue. The agent runs in an isolated clone, decides `implement` or `pushback`, and either commits a diff or writes a pushback comment. For this study, dispatches used `--no-target-claude-md --issue-body-only` so the only context varied is the per-agent `CLAUDE.md` itself — without these flags, effective context size differs from the per-agent file size and the curve becomes uninterpretable. Coding cells used **Sonnet 4.6**; the test generator and reasoning judge used **Opus 4.7**.

Two target repos supply issues across legs: `vaultpilot-mcp` (vitest, open issues) and `vaultpilot-dev-framework` (node-test, closed issues with a ground-truth PR fix and a pinned `baseSha`).

### 2.2 The Q quality metric

The measure of success is per-cell quality Q, defined verbatim:

```
Q =  A + B    if decision == "implement" AND the diff applied cleanly   (range 0..100)
     2 × A    if decision == "pushback"                                  (range 0..100)
     0        if decision == "error" / parse failure / apply failure
```

- **A ∈ 0..50** — the median of an Opus-4.7 K=3 blinded reasoning judge. It reads the issue body plus the agent's diff (or pushback comment) with agent IDs, branch names, and replicate hints stripped.
- **B ∈ 0..50** — `(passed / total) × 50` from the issue's ~100 committed hidden tests applied to the agent's worktree diff.

**Measure-of-success design choice.** A is graded by an independent model on a blinded artifact and B is an executable test suite the agent never sees; **the subject does not grade its own output**. This is the falsifiability guarantee: the metric is read from an independent judge and an objective test oracle, not from the agent's self-report. The **falsifier** is direct — if curating `CLAUDE.md` improves code quality, the curated arm's mean Q exceeds the baseline's at p<0.05 on a paired test; the study repeatedly fails to reject the null, which is the reportable negative result rather than an absence of signal by construction.

The curve sample factor is `qmax / quality` (anchored at 1.0 for the highest-quality agent). The factor is scale-invariant under any monotone quality rescale, so a quality-formula rescale is invisible to the fit and to runtime consumers.

### 2.3 Trim generation

The density axis is generated by `randomTrim` over the #179 parent agent (`agent-916a`, a ~60 KB accumulated `CLAUDE.md`): 6 nominal sizes (≈6 / 14 / 22 / 35 / 50 / 58 KB) × 3 random seeds = 18 trim agents. Each trim is a random subset of the parent's sections at the target byte budget — undirected pruning, the control against directed selection. The super-agent phase (§3.4) uses a wider 12-size grid (0 → 209 KB) over a 122-section pooled super-agent file.

### 2.4 Replication and decision rule

K=N replicates per cell reduce per-cell variance. The curve-redo legs pool 6 vp-mcp + 7 vp-dev issues per agent (K=13 cells/agent); picker arms use K=3; the super-agent curve uses K=1 with a K=3 high-variance follow-up. The **merge gate** is the pre-registered decision rule: a calibration curve is hand-merged into runtime only if the accuracy fit clears **p<0.05**.

### 2.5 Statistical methods

- **OLS curve fit + AIC sweep.** Forms swept at minimum {linear-raw, linear-log(x), poly2-raw, poly2-log(x)}; AIC = `n·ln(rss/n) + 2(degree+1)`; ΔAIC<2 is "indistinguishable evidence" and ties break to the simpler form. A leave-out-N-outliers refit guards against a single point absorbing variance.
- **Paired Wilcoxon signed-rank** for arm-vs-arm comparisons (paired by issue), one- and two-sided as noted.
- **Bootstrap confidence intervals** (10,000 resamples) on mean paired differences — reported alongside Wilcoxon because the rank test discards magnitude and under-counts asymmetric high-magnitude differences.
- Effect size via **Hedges' g**.

---

## 3. Experiments

Each phase changed one thing from its predecessor in response to that predecessor's result. Raw analyses are linked per phase.

### 3.1 Baseline #179 — K=13 variance reduction

*Design:* the #179 phase-3 study established the 18 trim agents (parent `agent-916a`) and the K=13 cells/agent target by pooling two legs (vp-mcp 108 cells + vp-dev 126 cells). *Why:* K=6 per leg left the accuracy fit at p≈0.10; pooling drops each outlier's leverage from 1/3 to 1/13 per size so the signal can clear p<0.05 organically. This phase produced the trim corpus every later arm reuses. Design in [`research/00-baseline-issue179/`](00-baseline-issue179/README.md).

### 3.2 Curve-redo legs — falsifiable quality metric

*Hypothesis:* a calibratable accuracy-vs-density curve exists. *Change from #179:* replace #179's quality proxy with the falsifiable A+B 0–100 metric (§2.2); regenerate the curve. *Design:* leg 1 = 6 vp-mcp issues × 18 trims = 108 cells; leg 2 = 7 vp-dev issues × 18 trims = 126 cells; combine and fit. 232 cells survived (2 envelope-parse-fails dropped). Analyses in [`research/01-curve-redo-legs/`](01-curve-redo-legs/README.md).

### 3.3 Picker variants — does directed selection beat random trim?

*Hypothesis:* a routed specialist beats a trimmed parent on the same issues. *Change:* hold the corpus fixed, swap the agent-selection mechanism. *Design:* three arms, K=3, n=13 paired issues — (a) Jaccard-tag picker routing to evolved specialists; (b) one freshly-minted naive general agent; (c) a full-prose Opus-4.7 LLM picker reading every idle agent's `CLAUDE.md`. Each paired against the trim baseline. Analyses in [`research/02-picker-variants/`](02-picker-variants/specialist-redo-results.md).

### 3.4 Super-agent curve — does pooled content help?

*Hypothesis:* a single super-agent containing the deduped union of every agent's `CLAUDE.md`, given to every dispatch, is the right architecture. *Change:* instead of selecting content, pool *all* of it (122 sections, 209 KB) and trim that down a 12-size grid (0 → 209 KB) × 3 seeds × 13 issues, K=1. A K=3 high-variance add-on (6 issues × 4 boundary sizes) tested whether the K=1 argmaxes were seed-noise. Analyses in [`research/03-super-agent/`](03-super-agent/phase-d-results.md).

### 3.5 Tailored selection — per-issue rule curation

*Hypothesis:* an Opus-4.7 selector picking the right ≈9% of the 122-section super-agent *per issue* beats a prose-picked specialist. *Change:* selection is now per-issue and content-aware, not per-agent. *Design:* Phase A (Opus selector, $3.04, 13 issues), Phase B (deterministic mint of 13 tailored agents), Phase C/D/E (K=3 dispatch, paired Wilcoxon vs prose), then a corpus expansion n=13→19, an A/B split analysis, a B-axis cross-arm rank, and a 4-arm v2-rescored aggregation. Analyses in [`research/04-super-agent-tailored/`](04-super-agent-tailored/phase-c-results.md).

### 3.6 Complex7 / methodology-v9 — hard issues, audited metric

*Hypothesis:* specialization helps on *complex-architectural* issues even if it doesn't on infra fixes. *Change:* a new 7-issue corpus selected as complex/architectural {86, 100, 119, 308, 325, 427, 460}, 4 arms (tailored / prose / trim / generalist), K=3. A five-bug methodology audit (§7) then corrected the scoring before the final read. Analyses in [`research/05-complex7/`](05-complex7/README.md) and [`research/05-complex7/methodology-v9/`](05-complex7/methodology-v9/README.md).

---

## 4. Results

Organized by claim. Every statistic cites its source file.

### 4.1 The quality–density curve: small, non-monotone, quadratic-raw

The combined 232-cell fit clears the merge gate on accuracy and adopts the same form for cost ([`curve-redo-combined-results.md`](01-curve-redo-legs/curve-redo-combined-results.md)):

| Curve | Form | n | R² | R²adj | F | p | Quad-coef p |
|---|---|---:|---:|---:|---|---:|---:|
| Accuracy | quadratic-raw | 18 | 0.3729 | 0.2892 | F(2,15)=4.46 | **0.030** ✓ | 0.015 |
| Token cost | quadratic-raw | 18 | 0.2593 | 0.1606 | F(2,15)=2.63 | 0.105 | 0.037 |

The model-form sweep is decisive that no monotone fit works:

| Form | Accuracy p | Token-cost p |
|---|---:|---:|
| linear-log (original default) | 0.737 | 0.495 |
| linear-raw | 0.352 | 0.974 |
| quadratic-log | 0.188 | 0.075 |
| **quadratic-raw** ✓ | **0.030** | 0.105 |
| cubic-log | 0.038 | 0.148 |

Both linear forms fit a flat line (R²≈0). A one-way ANOVA across the 6 size buckets is significant (F(5,12)=3.50, p=0.035) — the buckets *do* differ, but non-monotonically: quality degrades 6k→35k then **recovers** 35k→50k+. Quadratic-raw is the simplest model that captures the bend; cubic-log scores marginally higher R²adj but ties on AIC (Δ=0.07) so parsimony wins. **The effect is real but small** — observed per-bucket accuracy factor ranges only 1.032–1.154 (best-to-worst quality gap ≈12%) across the entire 6k–58k range. Per-leg, the reasoning judge saw essentially no size effect: leg-2 mean A was 41 ± 0.4 across all six sizes ([`leg2-results.md`](01-curve-redo-legs/leg2-results.md)).

### 4.2 Every directed picker ties ≈17 Q below random trim

Three independently designed pickers were each paired against the trim baseline over the same 13 issues, K=3 ([`specialist-redo-results.md`](02-picker-variants/specialist-redo-results.md), [`picker-vs-content-results.md`](02-picker-variants/picker-vs-content-results.md), [`prose-baseline-results.md`](02-picker-variants/prose-baseline-results.md)). The four-arm matrix (cell = `mean(row.Q) − mean(col.Q)`):

| | trim | specialist | naive | prose |
|---|---:|---:|---:|---:|
| trim | — | +17.5 | +17.1 | +17.8 |
| specialist | −17.5 | — | +0.08 (n.s.) | +0.31 (n.s.) |
| naive | −17.1 | −0.08 | — | +0.70 (n.s.) |
| prose | −17.8 | −0.31 | −0.70 | — |

Trim dominates all three by ≈17 Q (Wilcoxon p≈0.99 against "picker better", Hedges' g ≈ −0.9); the three pickers are within 1 Q of each other. The gap is two-clustered: 6 pushback / launch-breadcrumb / gate issues are at parity (dQ ∈ [−2, +3]); 7 implement-class issues with non-trivial diffs lose to trim by 14–42 points.

**The dominant alternative explanation, named in the source as caveat #1:** the trim agents are descendants of `agent-916a`, the orchestrator that originally worked these exact 13 issues. The trim baseline carries direct prior issue exposure. Under the caveat-aware reading, *neither the picker nor the per-agent content moves the needle — what moves it is prior exposure to the measured issues*, and no picker among existing specialists can close a gap that lives in the comparator. The prose arm also costs significantly more per cell than naive (+$0.23, p≈0.996) for equivalent quality.

### 4.3 Super-agent: quality FLAT, quality-per-dollar drops 2.4×

The 12-size super-agent curve (468 cells, 36 trim aggregates) makes the density question crisp ([`phase-d-results.md`](03-super-agent/phase-d-results.md), [`leg6-results.md`](03-super-agent/leg6-results.md)):

| Axis | Result |
|---|---|
| **Quality** | **FLAT, no signal.** All 6 OLS forms adj-R²≤0; degree-1 log p=0.333; leave-out-2 refit p=0.101. Q oscillates 35.6–46.8 across all 12 sizes with no trend. |
| **Cost** | **Strong linear**, slope ≈ +4.4×10⁻⁶ $/byte, R²=0.903, **p=9.3×10⁻¹⁹**. Identity strictly dominates log forms (ΔAIC ≥ 18). |
| **Error** | Not significant; confounded by the cap-regime change (see §7). |

Quality-per-dollar drops monotonically from **56.8 at size 0** to **23.5 at size 209042** — a **2.4× efficiency loss** for the full super-agent vs zero context. The bare orchestrator prompt is the best quality-per-dollar of any size tested.

A decomposition softens but does not overturn this: judge-A is flat across sizes (range 69–74/100), while the hidden-test B-axis on implements alone shows a small significant log gain (degree-1 log, R²=0.179, p≈0.009, ≈+5 points on the 0–100 B scale across the full grid). The combined Q masks the B signal because ≈23% of cells are pushback (Q=2A, B contributes 0) and the large flat A dominates the sum. The B gain is too small to offset the linear cost rise — quality-per-dollar still drops. The K=3 high-variance follow-up confirmed 5 of 6 per-issue argmaxes were stable but exposed that the K=1 noise floor was understated (per-(size,issue) sd is 10–25 at K=3, not the ≈1 K=1 suggested) ([`k3-highvar-results.md`](03-super-agent/k3-highvar-results.md)).

### 4.4 Tailored selection: cost win only; the combined-Q "signal" was composition

The per-issue Opus selector was paired against prose. The final n=19, 4-arm, v2-rescored aggregation ([`phase-c-n19-4arm-final-results.md`](04-super-agent-tailored/phase-c-n19-4arm-final-results.md)):

| Pair | Q axis (paired Wilcoxon 2-sided) | Cost axis |
|---|---|---|
| tailored vs prose (n=19) | +9.54 Q, p=0.107 (n.s.); CI95 [+2.16, +17.18] | **−$0.38, p=0.042**; CI95 [−$0.68, −$0.12] |
| tailored vs specialist (n=19) | +11.75 Q, p=0.083; CI95 [+1.67, +23.78] | +$0.08, p=0.533 |
| prose vs specialist (n=19) | +2.21 Q, p=0.449 | +$0.46, p=0.026 |

The cost ordering is **trim ≈ specialist < tailored < prose**, with tailored-vs-prose the only pairwise cost gap clearing two-sided p<0.05. The earlier resolved n=19 read was the cleanest statement: *tailored saves ≈$0.12/cell vs prose (95% CI excludes zero, P(cost<0)=0.990) with no quality change* ([`phase-c-n19-rescored-results.md`](04-super-agent-tailored/phase-c-n19-rescored-results.md)).

**The combined-Q decomposition is the key result.** When the combined-Q axis is split into judge-A and tests-B and aligned by issue ([`phase-c-n19-split-results.md`](04-super-agent-tailored/phase-c-n19-split-results.md)):

| Axis | n | Wilcoxon p | Bootstrap mean Δ | 95% CI |
|---|---:|---:|---:|---|
| Judge-A | 6 | 0.458 | +0.47 | [−0.53, +1.83] |
| Tests-B | 3 | 0.500 | +0.07 | [−0.46, +0.67] |

Within a decision class, both arms produce judge scores within ±1 point and test scores within ±0.7. **The combined-Q lead was driven by decision-class composition — which issues each arm chose to push back on (Q=2A scores high on a good pushback) — not by quality differences within a class.** The n=13 +2.20 mean dQ was an artifact of #168's +36.8 outlier and did not reproduce on the new 6 issues (which were flat: bootstrap mean −0.18 to −0.57). The cost advantage is the only reproducible effect; trim still beats tailored by ≈15 Q on the recoverable subset. The B-axis cross-arm rank ([`phase-c-b-axis-rank-results.md`](04-super-agent-tailored/phase-c-b-axis-rank-results.md)) confirms the top three arms are inside the noise floor (all six pairwise Wilcoxon p ∈ 0.26–0.96); trim's only distinguishing trait is more complete-failure cells (5 at B=0) on complex issues.

### 4.5 Complex7: the no-context generalist beats every specialization form

On the 7 complex-architectural issues, after the five-bug methodology audit (§7), the v9 result reverses the original "no signal" read ([`methodology-v9/README.md`](05-complex7/methodology-v9/README.md), [`generalist-vs-all.md`](05-complex7/methodology-v9/generalist-vs-all.md)).

Judge-A per-arm evolution across audit versions:

| Version | Tailored | Prose | Trim (rand K=3) | Generalist |
|---|---:|---:|---:|---:|
| v3/v4 (wrong baseSha) | 37.12 | 35.02 | 35.31 | 36.71 |
| v6 (+correct baseSha, interface-fixed) | 35.57 | 35.02 | 34.24 | 36.71 |
| **v9 (+force-implement)** | **24.05** | **26.88** | **31.29** | **36.71** |

Tailored pushed back on 43% of cells, prose 29%, trim 6%, generalist 0%. Q=2A rewards a good pushback, so the curated arms were winning by *dodging hard implements*. Forcing all arms to implement the same issues (`VP_DEV_FORCE_IMPLEMENT=1`, 19 re-dispatched cells) collapsed the curated arms' apparent A advantage. Final paired Wilcoxon (v9):

| Comparison | n | mean diff (X − gen) | bootstrap CI95 | p(gen > X) | Verdict |
|---|---:|---:|---:|---:|---|
| tailored vs generalist | 5 | −13.49 | [−21.17, −5.94] | 0.985 | generalist wins (1-sided p≈0.015) |
| prose vs generalist | 5 | −11.63 | [−21.39, −3.25] | 0.985 | generalist wins (1-sided p≈0.015) |
| trim vs generalist | 6 | −6.00 | [−11.39, +0.33] | 0.953 | generalist wins (1-sided p≈0.047) |
| tailored vs prose | 5 | −2.93 | [−7.93, +2.05] | 0.785 | tie |

**Generalist wins or ties every pairwise comparison on both axes.** The probability that one arm wins 6 of 6 pair-axis combinations in the same direction by chance under the null is ≈2⁻⁶ ≈ 0.016. The trim-vs-generalist direction is invariant across all 5 random-K subsampling seeds (all 10 A/B diffs negative). #460 (a security-invariant issue) is the one issue where tailored/prose specifically beat generalist on tests-B — but trim, also a "specialist" arm, scores worst there, so the "curated wins #460" story is narrow.

---

## 5. Discussion

**Why specialization fails to transfer quality.** Across density (§4.1, §4.3), selection (§4.2), per-issue tailoring (§4.4), and complex-issue specialization (§4.5), no directed manipulation of `CLAUDE.md` content produced a quality gain that survived a fair comparison. The judge-A axis — reasoning quality — is flat with size and flat across selection arms; whatever the accumulated lessons encode, it does not change how a fresh Sonnet agent reasons about an issue it is seeing through a clean prompt. The small hidden-test-B gain that exists with pooled size (§4.3) is real but ≈5 points on a 100-point scale and is dwarfed by the linear cost rise.

**Cost is the only reliable lever.** The one statistically robust, reproducible effect anywhere in the program is that smaller/curated context is cheaper: cost is linear in `CLAUDE.md` bytes at p<10⁻¹⁸ (§4.3), and per-issue tailoring saves ≈$0.12/cell vs prose with the 95% CI excluding zero (§4.4). Specialization buys cost, not quality.

**The decision-class-composition confound and how the split controlled it.** The single most important methodological finding is §4.4: a combined-Q metric that mixes pushback (Q=2A) and implement (Q=A+B) cells lets an arm win by *choosing* to push back on issues where pushback grades well. The apparent tailored-Q lead evaporated when Q was decomposed into A and B and re-paired within decision class. The complex7 force-implement intervention (§4.5) is the same control applied at dispatch time rather than at analysis time, and it reversed the complex-issue verdict entirely. Any future quality comparison in this orchestrator must either split by decision class or force a fixed decision.

**Implication for the orchestrator's agent-minting strategy.** On the hardest issues — the complex-architectural ones where specialization was the last plausible win — the no-context generalist wins. This argues against the premise that minting and curating per-issue specialists improves output quality. The agent-minting, summarizer, and picker machinery is justified by cost shaping and operational ergonomics, not by a quality transfer that the data does not support.

---

## 6. Threats to Validity / Limitations

- **Judge variance is the dominant residual.** The K=3 high-variance follow-up showed the K=1 per-(size,issue) noise floor was understated by ≈20× (sd 10–25 vs the ≈1 K=1 implied). Effects smaller than ≈10 Q points are not separable from judge noise at the replication used on most legs.
- **Underpowered at small n on the decisive phases.** Complex7 A-axis pairs are n=5–6; the split analysis is n=6 on A and n=3 on B. Two-sided p stays at 0.06–0.14 even with invariant direction; the inferential reads rely on one-sided p and bootstrap CIs and do not survive Bonferroni correction across the 16+ test family. The generalist result's strength comes from direction-consistency across 6 pair-axis combinations, not from any single test.
- **Cap-regime cost artifacts.** Super-agent legs 1–3 ran at a $2 per-cell cap, legs 4–5 at $4, leg 6 at $6. The leg-3 error U-shape was a $2-cap truncation artifact, refuted at leg-4 once the cap stopped binding. Cost-axis points across cap regimes are not directly comparable on the cap-bias dimension; the quality axis is comparable.
- **Right-tail extrapolation gap.** The curve-redo calibration tops out at 58 KB; the runtime soft cap is 64 KiB. The super-agent curve extends to 209 KB but is flat on quality there. Behavior of a *directed* curation beyond ≈60 KB is uncharacterized.
- **Single model family.** All coding cells are Sonnet 4.6; all judging is Opus 4.7. Whether the no-transfer result generalizes to other model families is open.
- **Corpus skew toward pushback-class issues.** The curve-redo 13-issue corpus has a heavy pushback fraction; pushback cells carry no B and are graded on 2A only. This is the confound §4.4/§4.5 controlled for; it remains a property of the corpus rather than a fully eliminated threat.
- **Trim-baseline contamination (caveat #1).** The §4.2 trim agents descend from the orchestrator that originally worked the measured issues. The ≈17 Q gap is best modeled as an issue-specific-exposure premium, not picker or content quality. A clean-baseline arm (freshly-minted specialists on unrelated territory) was scoped but not run.

---

## 7. Methodology corrections (brief)

The program self-corrected several measurement bugs that, uncorrected, would have produced false positives. The super-agent leg-3 error U-shape was a $2-cap truncation artifact, refuted at leg-4 once the cap was raised. An 88-judge-failure batch transiently created an artificial Q=0 quality signal (p=0.040) that the corrected re-score reversed. The complex7 v9 audit fixed five distinct scoring bugs — wrong baseSha in score clones, interface-coupled hidden tests, test permissiveness, an over-broad test-runner glob, and the pushback/implement Q-composition asymmetry — and only after those fixes did the generalist result emerge. The recurring lesson is that a combined metric mixing decision classes, and any scoring path that can silently fall through to a canonical fix, must be audited before a positive result is trusted; details are in the per-phase analyses.

---

## 8. Conclusion

**Directed specialization of `CLAUDE.md` content does not transfer code quality across coding agents on this orchestrator; the bare/random baseline is hard to beat and its only reliable lever is cost.** The accuracy–density curve is real but small and non-monotone; three independent pickers tie ≈17 Q below random trim; a 209 KB super-agent is flat on quality while 2.4× worse per dollar; per-issue tailoring buys ≈$0.12/cell and no quality; and on the hardest issues the no-context generalist beats or ties every specialization form.

**Actionable recommendation.** Default new dispatches to a bare or randomly-trimmed agent — it is quality-competitive everywhere measured and cheapest. Use specialization/tailoring to *shape cost*, not to chase quality. For complex-architectural issues specifically, prefer the generalist. Always split quality comparisons by decision class (or force a fixed decision) so a composition confound cannot masquerade as a quality signal.

**Open question.** The right tail beyond ≈60 KB under *directed* curation, and whether the no-transfer result holds for other model families, remain uncharacterized. A clean-baseline arm (freshly-minted specialists on unrelated topical territory) would convert the §4.2 caveat-#1 contamination from an argued explanation into a measured one.

---

## Appendix: Phase index

Dated chronological index of every prose analysis: [`research/TIMELINE.md`](TIMELINE.md). Phase directories:

| Phase | Directory | Span |
|---|---|---|
| 0 — Baseline #179 | [`research/00-baseline-issue179/`](00-baseline-issue179/README.md) | 2026-05-06 |
| 1 — Curve-redo legs | [`research/01-curve-redo-legs/`](01-curve-redo-legs/README.md) | 2026-05-07 → 08 |
| 2 — Picker variants | [`research/02-picker-variants/`](02-picker-variants/specialist-redo-results.md) | 2026-05-08 → 09 |
| 3 — Super-agent curve | [`research/03-super-agent/`](03-super-agent/phase-d-results.md) | 2026-05-09 → 11 |
| 4 — Tailored selection | [`research/04-super-agent-tailored/`](04-super-agent-tailored/phase-c-results.md) | 2026-05-09 → 12 |
| 5 — Complex7 / methodology-v9 | [`research/05-complex7/`](05-complex7/README.md) | 2026-05-12 → 13 |

Raw data, hidden-test corpora, and reproducer scripts: [`research/curve-redo-bundle/`](curve-redo-bundle/README.md).
