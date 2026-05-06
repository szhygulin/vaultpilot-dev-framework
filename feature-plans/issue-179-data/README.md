# Issue #179 — pilot data archive

Snapshot of the partial #179 study run as of 2026-05-06 (paused mid-experiment, not a finished study).

## Contents

- `cells.json` — 33 cells with valid envelopes:
  - 15 cells from the pilot run against `vaultpilot-mcp` (3 sizes × 5 issues, 1 harness error)
  - 16 cells from the smoke-test phase 1 against `vaultpilot-mcp-smoke-test` (10 sizes × 2 issues partial — #47 has 9 sizes, #48 has 7 sizes)
  - 2 cells of incidental data (early test runs)
- `trims-pilot/` — the 3 hand-trimmed CLAUDE.mds used in the vp-mcp pilot (16/32/48 KB tuned for vp-mcp domain).
- `trims-7/` — the 7 smoke-test-tuned trims used in the abandoned 7-size run (8/16/24/32/40/48/64 KB). Run died on worktree contention before producing data.
- `trims-10/` — the 10 smoke-test-tuned trims for the current study (6/10/14/18/22/28/34/42/50/58 KB). 16 cells of usable data so far.

## Total spend

$164.50 across 33 cells (mean $4.98/cell).

## Headline findings (paused state)

- vp-mcp pilot: pushback rate flat at 60% across all 3 sizes; outcome-quality rubrics scored 100/100 on all cells. The trim-induced signal is in cost variance, not outcome quality.
- smoke-test phase 1 (#47, "Golden canary scripts"): 9 of 10 sizes complete; mean cell cost $6.75 (vs $1.50 forecast). 3 of 9 cells produced `outcome=error` envelopes — a real signal that needs the full curve to interpret.
- smoke-test #48 partial: only 7 cells; one cell was 5× cheaper ($1.28 / 42KB / pushback) suggesting #48 is an advisory-class issue where most agents would push back.

## How to resume

The 10 study agents (`agent-9180` through `agent-9189`) and 10 isolated clones (`/tmp/study-clones/clone-1..10`) remain in place locally; the dispatch harness at `/tmp/smoke10_dispatch_phase2.sh` will run the missing 28 cells (8×#50 + 10×#52 + 10×#54) when relaunched.

## What's NOT in this archive

Per the project's local CLAUDE.md rule (`agents/`, `state/`, `logs/`, `dist/` are gitignored), the following are not committed: registry mutations (`state/agents-registry.json`), per-agent transcripts (`logs/smoke10-agent-*.log`), spawn run-state JSON (`state/run-*.json`). Re-extracting the cell envelopes from the logs is reproducible via the `cells.json` snapshot's source paths, all of which point at gitignored log files.
