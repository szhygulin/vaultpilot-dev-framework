# Research corpus timeline

Prose analyses for the agent-density / CLAUDE.md-size research program,
reorganized into date-ordered phase directories (first-add dates from
`git log --diff-filter=A`). Raw-data corpora and result tarballs stay at
`research/curve-redo-bundle/` (path-referenced by `src/cli.ts` + `ROADMAP.md`);
see that directory's `README.md`.

| Dir | Date | Contents |
|-----|------|----------|
| `00-baseline-issue179/` | 2026-05-06 | Issue-179 leg-2 bundle: 18 trim agents (parent `agent-916a`), `agents-spec-phase3*.json`, `trims-phase3/`. Seeds every later trim-arm. |
| `01-curve-redo-legs/` | 2026-05-07→08 | Curve-redo experiment: leg-1 (vp-mcp) + leg-2 (vp-dev-agents) + combined fit (quadratic-raw). Replaces #179's K=13 with the falsifiable A+B 0–100 quality metric. |
| `02-picker-variants/` | 2026-05-08→09 | Picker-arm experiments: specialist-redo, picker-vs-content, prose-baseline. All directed-pruning pickers tie ≈−17 Q vs the random-trim baseline. Includes the `specialist-redo/` reproducer scripts. |
| `03-super-agent/` | 2026-05-09→11 | Super-agent (122-section, 209 KB parent) curve: 6 legs across trim sizes, Phase D/E combiner, K=3 high-variance follow-up. |
| `04-super-agent-tailored/` | 2026-05-09→12 | Tailored-selection arm: Opus-4.7 per-issue rule selection (Phase A/B/C), n=19 corpus expansion, B-axis-rank, 4-arm aggregation. |
| `05-complex7/` | 2026-05-12→13 | 7 "complex / architectural" issues; methodology-v9 (correct baseSha + interface-agnostic tests); generalist-vs-all. Includes complex7 data bundles. |
