# Research corpus timeline

Master synthesis: [`PAPER.md`](PAPER.md) — the scientific write-up of the
agent-density / CLAUDE.md-content research program.

Dated chronological index of every prose analysis. Dates are first-add dates
(`git log --diff-filter=A`). Raw-data corpora and result tarballs stay at
[`research/curve-redo-bundle/`](curve-redo-bundle/README.md) (path-referenced by
`src/cli.ts` + `ROADMAP.md`); analyses live in date-ordered phase dirs.

| Date | Phase | Analysis file | One-line result |
|------|-------|---------------|-----------------|
| 2026-05-06 | 0 — Baseline #179 | [`00-baseline-issue179/README.md`](00-baseline-issue179/README.md) | K=13 variance-reduction design; 18 trim agents (parent `agent-916a`) seed every later trim arm. |
| 2026-05-07 | 1 — Curve-redo | [`01-curve-redo-legs/leg1-results.md`](01-curve-redo-legs/leg1-results.md) | Leg 1, 108 vp-mcp cells; mean A flat ≈38, no monotone size effect alone; ≈$88. |
| 2026-05-07 | 1 — Curve-redo | [`01-curve-redo-legs/leg2-results.md`](01-curve-redo-legs/leg2-results.md) | Leg 2, 126 vp-dev cells; mean A 41 ± 0.4 across all 6 sizes; ≈$220. |
| 2026-05-08 | 1 — Curve-redo | [`01-curve-redo-legs/curve-redo-combined-results.md`](01-curve-redo-legs/curve-redo-combined-results.md) | Combined 232 cells: accuracy quadratic-raw **p=0.030 ✓** (clears merge gate); cost shares the form (p=0.105). |
| 2026-05-08 | 2 — Picker variants | [`02-picker-variants/specialist-redo-results.md`](02-picker-variants/specialist-redo-results.md) | Jaccard-picker specialists score **−17.5 Q** vs trim (Wilcoxon p≈0.99); cheaper (p=0.013). |
| 2026-05-08 | 2 — Picker variants | [`02-picker-variants/picker-vs-content-results.md`](02-picker-variants/picker-vs-content-results.md) | Fresh naive agent ≈ specialist; both −17 vs trim. Picker is not the bottleneck. |
| 2026-05-09 | 2 — Picker variants | [`02-picker-variants/prose-baseline-results.md`](02-picker-variants/prose-baseline-results.md) | Full-prose Opus picker also −17.8 vs trim; more expensive. All 3 pickers tie within 1 Q. |
| 2026-05-09 | 3 — Super-agent | [`03-super-agent/leg1-results.md`](03-super-agent/leg1-results.md) | Legs 1 (sizes 0/408B), $63.60, 78 cells; cost 1.17× baseline at smallest trim. |
| 2026-05-09 | 3 — Super-agent | [`03-super-agent/leg3-results.md`](03-super-agent/leg3-results.md) | Legs 1–3 synthesis; error U-shape surfaced ($2 cap); cap raised to $4 for legs 4–6. |
| 2026-05-09 | 3 — Super-agent | [`03-super-agent/leg4-results.md`](03-super-agent/leg4-results.md) | $4 cap **refutes the leg-3 U-shape**; errors decay monotonically once cap unbinds; cost linear p<10⁻⁴. |
| 2026-05-09 | 4 — Tailored | [`04-super-agent-tailored/phase-a-results.md`](04-super-agent-tailored/phase-a-results.md) | Opus per-issue selector, 13 issues, $3.04; keeps median ≈9% of the 122 sections. |
| 2026-05-11 | 3 — Super-agent | [`03-super-agent/leg5-results.md`](03-super-agent/leg5-results.md) | Legs 1–5 synthesis (n=30); cost still significant p<10⁻⁸; one $4 cap-hit motivates $6 for leg 6. |
| 2026-05-11 | 3 — Super-agent | [`03-super-agent/leg6-results.md`](03-super-agent/leg6-results.md) | Phase C complete (468 cells, $500.92); cost robustly linear, $6 cap well-sized (0 hits). |
| 2026-05-11 | 3 — Super-agent | [`03-super-agent/phase-d-results.md`](03-super-agent/phase-d-results.md) | **Quality axis FLAT** (all forms adj-R²≤0); cost linear p=9.3×10⁻¹⁹; **Q/$ drops 2.4×** 0→209 KB. |
| 2026-05-11 | 3 — Super-agent | [`03-super-agent/k3-highvar-results.md`](03-super-agent/k3-highvar-results.md) | K=3 add-on: 5/6 argmaxes stable; K=1 noise floor was understated ≈20×. |
| 2026-05-11 | 4 — Tailored | [`04-super-agent-tailored/phase-b-results.md`](04-super-agent-tailored/phase-b-results.md) | 13 tailored agents minted deterministically; median 18.9 KB vs 209 KB super-agent. |
| 2026-05-11 | 4 — Tailored | [`04-super-agent-tailored/phase-c-results.md`](04-super-agent-tailored/phase-c-results.md) | Tailored vs prose n=13: no significant Q or cost difference at p<0.05; signal in implement subset. |
| 2026-05-12 | 4 — Tailored | [`04-super-agent-tailored/phase-c-n19-results.md`](04-super-agent-tailored/phase-c-n19-results.md) | Corpus n=13→19: cost CI excludes zero (P(cost<0)=0.990); quality flat. #168 was an outlier. |
| 2026-05-12 | 4 — Tailored | [`04-super-agent-tailored/phase-c-n19-rescored-results.md`](04-super-agent-tailored/phase-c-n19-rescored-results.md) | Re-score on 100-test grid: identical verdict — ≈$0.12/cell cost win, no quality change. |
| 2026-05-12 | 4 — Tailored | [`04-super-agent-tailored/phase-c-n19-split-results.md`](04-super-agent-tailored/phase-c-n19-split-results.md) | Split A from B: combined-Q "signal" was **decision-class composition**, not within-class quality. |
| 2026-05-12 | 4 — Tailored | [`04-super-agent-tailored/phase-c-b-axis-rank-results.md`](04-super-agent-tailored/phase-c-b-axis-rank-results.md) | B-axis cross-arm rank: top 3 arms inside noise floor; trim has more complete-failures on complex. |
| 2026-05-12 | 4 — Tailored | [`04-super-agent-tailored/phase-c-n19-4arm-final-results.md`](04-super-agent-tailored/phase-c-n19-4arm-final-results.md) | 4-arm v2 rescore: tailored beats prose on cost p=0.042; Q lead large but n=19 too noisy for 2-sided. |
| 2026-05-13 | 5 — Complex7 | [`05-complex7/README.md`](05-complex7/README.md) | 4 arms × 7 complex issues; raw-data bundles + v3/v4 behavioral-test scoring pipeline. |
| 2026-05-13 | 5 — Complex7 | [`05-complex7/methodology-v9/README.md`](05-complex7/methodology-v9/README.md) | 5 scoring bugs fixed; after force-implement, **generalist +12.7 judge-A** over tailored (CI excludes 0). |
| 2026-05-13 | 5 — Complex7 | [`05-complex7/methodology-v9/generalist-vs-all.md`](05-complex7/methodology-v9/generalist-vs-all.md) | **Generalist wins or ties every pair on both axes**; family-wise ≈2⁻⁶ by chance. |
