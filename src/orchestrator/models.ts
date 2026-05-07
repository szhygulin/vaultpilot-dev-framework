// Single source of truth for the model tier each orchestrator-side LLM call
// site uses (issue #139, Phase 1 of #133). Each constant is overridable via
// an env var so cost-sensitive operators can downshift without code changes.
//
// Tier rationale:
//   - triage:      haiku — per-issue scan, often 50+ issues per run; opus at
//                  ~50× would be uneconomical and the rubric is narrow.
//   - dispatch:    opus  — cross-issue routing reasoning; mistakes cascade
//                  into wrong-agent assignments and burn coding-agent budget.
//   - split:       opus  — clusterer reasoning over the entire CLAUDE.md to
//                  propose meaningful splits; quality matters more than cost.
//   - summarizer:  sonnet — per-run, frequency-justifies-cheaper-tier; the
//                  task is structured rewrite of one transcript.
//   - trim:        sonnet — per-domain pool rank-and-prune; bounded input,
//                  proposes verdicts only (no generation).
//   - dedup:       opus  — reserved for Phase 2 of #133 (cross-issue dup
//                  detection); listed here so the registry is complete and
//                  Phase 2's import target already exists.
//
// New call sites must read from this file rather than reintroducing local
// `const FOO_MODEL = "..."` literals. The `run.started` log emits the full
// resolved map so post-hoc audits can confirm which tier each call site used.

export const ORCHESTRATOR_MODEL_TRIAGE =
  process.env.VP_DEV_TRIAGE_MODEL ?? "claude-haiku-4-5-20251001";

export const ORCHESTRATOR_MODEL_DISPATCH =
  process.env.VP_DEV_DISPATCH_MODEL ?? "claude-opus-4-7";

export const ORCHESTRATOR_MODEL_SPLIT =
  process.env.VP_DEV_SPLIT_MODEL ?? "claude-opus-4-7";

export const ORCHESTRATOR_MODEL_SUMMARIZER =
  process.env.VP_DEV_SUMMARIZER_MODEL ?? "claude-sonnet-4-6";

export const ORCHESTRATOR_MODEL_TRIM =
  process.env.VP_DEV_TRIM_MODEL ?? "claude-sonnet-4-6";

// Reserved for Phase 2 of #133 (dedup pass). Resolving the constant now —
// even though no call site reads it yet — keeps Phase 2's diff to the call
// site itself and lets the `run.started` log surface the resolved value
// from day one.
export const ORCHESTRATOR_MODEL_DEDUP =
  process.env.VP_DEV_DEDUP_MODEL ?? "claude-opus-4-7";

// Curve-redo experiment (Phase 1b/1c): hidden-test generator and
// blinded reasoning judge both run on opus by default — quality of the
// generated tests and grading rubric is the load-bearing dimension.
// Operators tightening the budget can downshift to sonnet via env var,
// but the default is opus for consistent measurement across cells.
export const ORCHESTRATOR_MODEL_TEST_GENERATOR =
  process.env.VP_DEV_TEST_GENERATOR_MODEL ?? "claude-opus-4-7";

export const ORCHESTRATOR_MODEL_REASONING_JUDGE =
  process.env.VP_DEV_REASONING_JUDGE_MODEL ?? "claude-opus-4-7";

/**
 * Snapshot of the resolved model map, suitable for inclusion in the
 * `run.started` log payload. Built as a function (not a const map) so each
 * call re-reads the constants — important if a test mutates `process.env`
 * between resolves, and clearer at the call site that the values are
 * captured at run-start time.
 */
export function resolvedModelTiers(): {
  triage: string;
  dispatch: string;
  split: string;
  summarizer: string;
  trim: string;
  dedup: string;
  testGenerator: string;
  reasoningJudge: string;
} {
  return {
    triage: ORCHESTRATOR_MODEL_TRIAGE,
    dispatch: ORCHESTRATOR_MODEL_DISPATCH,
    split: ORCHESTRATOR_MODEL_SPLIT,
    summarizer: ORCHESTRATOR_MODEL_SUMMARIZER,
    trim: ORCHESTRATOR_MODEL_TRIM,
    dedup: ORCHESTRATOR_MODEL_DEDUP,
    testGenerator: ORCHESTRATOR_MODEL_TEST_GENERATOR,
    reasoningJudge: ORCHESTRATOR_MODEL_REASONING_JUDGE,
  };
}
