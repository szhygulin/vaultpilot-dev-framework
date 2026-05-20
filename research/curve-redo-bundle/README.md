# curve-redo-bundle — raw-data home

Raw-data home — hidden-test corpora and result tarballs. Prose analyses were
reorganized chronologically into `research/0X-*` (see `research/TIMELINE.md`).
Paths here are referenced by `src/cli.ts` defaults and `ROADMAP.md`; do not move.

Contents that intentionally stay at this path:

- `curve-redo-tests/<issueId>/` — per-issue v1 hidden-test corpus (referenced by
  `src/cli.ts` `--tests-dir` default).
- `curve-redo-tests-behavioral/<issueId>/` — behavioral-test corpus.
- `leg1-results.tar.gz`, `leg2-results.tar.gz`, `specialist-redo-results.tar.gz`,
  `prose-baseline-results.tar.gz` — raw result bundles.
- `corpus.json`, `combine-legs.cjs`, `curve-redo-combined.json` — corpus
  definition + combiner script + combined dataset, path-referenced by the
  reproducer scripts now living under `research/0X-*`.
