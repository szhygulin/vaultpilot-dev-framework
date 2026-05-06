# `vp-dev research curve-study`

Re-fits `src/util/contextCostCurve.ts` (CLAUDE.md size → `accuracyDegradationFactor`) for a chosen development-agent specialty + model tier. Re-run when the orchestrator's primary model changes or when calibrating a different specialty class — the curve is model-version- and specialty-specific (#179).

## What the command does

1. Reads an operator-supplied list of pre-trimmed development agents (`--agents-spec`).
2. Dispatches one research-agent run per (devAgent, issue) cell against `--target-repo`, with 4-way parallelism + per-devAgent serialization (each devAgent has its own dedicated clone — protects against the worktree-race failure mode that broke the inaugural run).
3. Aggregates per-cell envelopes from logs.
4. Scores outcome quality per agent using #179's composite (`0.40·implement_rate + 0.25·pushback_accuracy + 0.20·(1−error_max_turns) + 0.15·pr_correctness`).
5. Fits a piecewise quadratic over (sizeBytes → factor), where `factor = qualityMax / quality`.
6. Writes a JSON proposal — the operator hand-merges the breakpoints into `CONTEXT_COST_BREAKPOINTS`.

## Why operator-input trims (not algorithmic)

A trim is a judgment about which CLAUDE.md sections still earn their bytes. Encoding that as an algorithm would either (a) over-trim load-bearing rules or (b) under-trim by being too cautious. The operator supplies N pre-trimmed CLAUDE.mds; this tool measures what those trims do.

## Inputs

### `--agents-spec <path>` — required JSON

```json
[
  { "devAgentId": "agent-9180", "sizeBytes": 6140,  "clonePath": "/tmp/study-clones/clone-1" },
  { "devAgentId": "agent-9181", "sizeBytes": 10255, "clonePath": "/tmp/study-clones/clone-2" },
  { "devAgentId": "agent-9182", "sizeBytes": 14300, "clonePath": "/tmp/study-clones/clone-3" }
]
```

Each entry must:
- Already be registered (`vp-dev agents list` to verify).
- Have its CLAUDE.md trimmed and committed to `agents/<devAgentId>/CLAUDE.md`.
- Have a dedicated clone of `--target-repo` at `clonePath`. Cross-agent isolation prevents worktree races.

### `--rubrics <path>` — optional JSON

After the dispatch finishes you usually want to score pushback comments and PR bodies for substance. Score 0/1 per cell:

```json
[
  { "agentId": "agent-9180", "issueId": 50, "pushbackAccuracy": 1, "prCorrectness": 0 },
  { "agentId": "agent-9180", "issueId": 52, "pushbackAccuracy": 0 }
]
```

Without rubrics, the tool defaults to "outcome bucket = right answer" (1 if outcome=pushback for pushback-accuracy, 1 if outcome=implement for PR-correctness). Provisional only.

## Output

```
{
  "generatedAt": "2026-05-06T...",
  "targetRepo": "szhygulin/vaultpilot-mcp-smoke-test",
  "issues": [50, 52, 54],
  "agents": [...],
  "cellCount": 28,
  "totalCostUsd": 178.42,
  "wallMs": 5102000,
  "scores": [
    { "agentId": "agent-9180", "agentSizeBytes": 6140, "implementRate": 0.66, "pushbackAccuracyRate": 1.0, ..., "quality": 0.812 },
    ...
  ],
  "breakpoints": [
    { "xBytes": 6140,  "factor": 1.0 },
    { "xBytes": 10255, "factor": 1.05 },
    ...
  ]
}
```

The operator pastes `breakpoints` into `CONTEXT_COST_BREAKPOINTS` in `src/util/contextCostCurve.ts`, updates the provenance comment, and commits.

## Cost & wall time

Forecast: `cellCount × $6.40` mean (observed in #179's pilot). Use `--parallelism` to trade wall time for concurrency; 4 is the calibrated default that avoids worktree-race contention.

## Inaugural dataset

The seed dataset for the curve currently in source lives in `feature-plans/issue-179-data/`. See `feature-plans/issue-179-context-cost-curve.md` for the methodology writeup and `feature-plans/issue-179-results.md` for the operator-judged scoring tables.
