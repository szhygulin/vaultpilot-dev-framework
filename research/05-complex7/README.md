# super-agent-complex7 — raw data bundle

Dispatch + v3/v4 scoring data from the 4-arm × 7-complex-issue experiment, May 2026.

## Issues studied
{86, 100, 119, 308, 325, 427, 460} — selected as "complex / architectural" PRs in [#302](https://github.com/szhygulin/vaultpilot-dev-framework/pull/302).

## Arms (4)
- **tailored** — issue-specialist agents with curated rules (1 agent per issue)
- **prose** — prose-style agents (per-issue, narrative format)
- **trim** — single `agent-916a` with 3 randomized trim-size variants (22000/35000/50000 token budgets); treat as a single arm
- **generalist** — single `agent-generalist`, no curated rules (base seed only)

Each (arm × issue) cell has K=3 replicates. Tailored composition: 12 leg1 + 9 leg2 = 21 cells per arm.

## Tarballs (one per arm)
- `complex7-tailored-data.tar.gz` — diffs, logs, v3 + v4 score JSONs, picks
- `complex7-prose-data.tar.gz` — same
- `complex7-trim-data.tar.gz` — same
- `complex7-generalist-data.tar.gz` — same

Each tarball expands to:
```
curve-redo-data/complex7-<arm>/
  diffs-leg{1,2}/                 # raw agent-captured diffs (post-replay-base-sha)
  logs-leg{1,2}/                  # per-cell agent logs (decision, cost, etc.)
  picks.tsv                       # (issue, agent, replicate) plan
  corpus-* / selections.json      # arm-specific config
curve-redo-data/v2-scoring/<arm>-complex7/
  <cell>-tests-v3.json            # v3 score (full hidden tests, mixed shape + behavioral)
  <cell>-tests-v4.json            # v4 score (behavioral-only subset of hidden tests)
  v3-logs/<cell>.log              # per-cell scoring log
  v3-filtered-diffs/<cell>.diff   # diff after noise-stripping (used for scoring)
```

Excluded from tarballs to keep size manageable:
- `score-clones-*/` and `v3-score-clones/` (per-cell git clones with `node_modules`, multi-GB each)
- `parallel-worker-*.log` (dispatcher state, not load-bearing)

## Scoring pipeline (scripts/)
- `filter-diff.cjs` — strips noise files (CLAUDE.md, AGENTS.md, package-lock, *.tar.gz, .gitignore) from the agent's captured diff. Keeps src/test/bin/package.json/tsconfig. Critical fix: each split block gets a trailing `\n` to avoid header gluing.
- `score-cell-v3.sh` — per-cell scoring: filter diff → fresh clone at baseSha → cascading apply (strict → 3-way → reject) → npm install → run hidden tests via `vp-dev research run-tests --baseline-only` → emit `{passed, total, applyCleanly, applyStatus}` JSON.
- `v3-parallel.sh` — bounded parallel driver over a cell manifest. Two-level `flock` locking: script-level singleton + per-cell lock (prevents the cross-arm scratch-clone race surfaced earlier in the session).

## Hidden test corpora
- `../curve-redo-tests/` — full corpus per issue (~100 tests each, mix of source-shape regex assertions and behavioral assertions)
- `../curve-redo-tests-behavioral/` — behavioral-only subset (excludes `readFileSync.toMatch(/regex/)`-style source-shape tests). Per-issue counts: 86=19, 100=18, 119=31, 308=14, 325=23, 460=12. Issue 427 has 0 behavioral tests after filtering and is excluded from the v4 corpus.

## v3 vs v4 distinction
- **v3** = scored against the full hidden test corpus (mix of shape + behavioral). Susceptible to "stub passes the regex" inflation.
- **v4** = scored against behavioral-only subset. Measures runtime correctness, not source shape.

Both score files preserved per cell; analysis can choose either or both.

## Cost
- tailored arm: not separately re-tracked this run (uses prior tailored bundle)
- prose arm: not separately re-tracked
- trim arm: not separately re-tracked
- generalist arm: $40.44 dispatch ($1.93/cell mean, leg1 $26.14 + leg2 $14.31)
- v3 + v4 re-scoring: $0 (local CPU only)

## Reproducibility
The pipeline is deterministic given (corpus.json baseShas, agent definitions, hidden test corpus). To re-score from any tarball:
1. Extract into a fresh worktree
2. Run `scripts/v3-parallel.sh <manifest> <max-jobs>` per arm

The lock prevents races if multiple invocations target the same LOG_DIR.
