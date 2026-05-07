// Curve-redo Phase 1c: blinded reasoning judge.
//
// For each cell, Opus reads {issue body, agent's diff OR pushback comment}
// and emits a 0-100 score on whether the artifact addresses the issue. K=3
// independent samples per cell, median; variance reported so high-variance
// cells can be flagged for operator review.
//
// Blinding strips agent IDs, branch names, replicate indices, and trim-size
// hints from the artifact before sending. The judge sees only the
// substantive content — same as a code reviewer reading a PR diff without
// knowing who wrote it.
//
// The output JSON is what Phase 1d's aggregator reads. Schema:
//   {median: 0..100, scores: number[], variance, rationales: string[],
//    costUsd, isError, errorReason}
//
// LlmCall is injectable so unit tests can substitute a synthetic K-sample
// generator without spinning up the real SDK.

import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "../../agent/sdkBinary.js";
import { parseJsonEnvelope } from "../../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_REASONING_JUDGE } from "../../orchestrator/models.js";
import type { Logger } from "../../log/logger.js";

const JUDGE_OUTPUT_SCHEMA = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string().min(1),
});

export type Decision = "implement" | "pushback" | "error";

export interface GradeReasoningInput {
  issueId: number;
  issueTitle: string;
  issueBody: string;
  decision: Decision;
  /** Present when decision === "implement". The captured worktree-diff. */
  diff?: string;
  /** Present when decision === "pushback". The agent's pushback comment text. */
  pushbackComment?: string;
  /** Number of independent judge samples. Default 3. */
  k?: number;
  /** Test seam: substitute the SDK call in unit tests. */
  llmCall?: LlmCall;
  logger?: Logger;
}

export interface GradeReasoningResult {
  /** Median of the K judge samples. 0-100. */
  median: number;
  /** All K samples (after blinding). */
  scores: number[];
  /** Sample variance across the K scores. High = judges disagreed; flag for review. */
  variance: number;
  /** Per-sample rationales (parallel to scores). */
  rationales: string[];
  costUsd?: number;
  /** True when one or more judge samples failed to produce a parseable score. Result still has the surviving samples. */
  partialFailure: boolean;
  /** When zero samples succeeded. */
  isError: boolean;
  errorReason?: string;
}

export type LlmCall = (args: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  sampleIndex: number;
}) => Promise<LlmCallResult>;

export interface LlmCallResult {
  raw: string;
  costUsd?: number;
  isError: boolean;
  errorReason?: string;
}

const DEFAULT_K = 3;

const JUDGE_SYSTEM_PROMPT = `You grade a coding agent's response to a GitHub issue. The agent either (a) implemented a fix and produced a unified diff, or (b) pushed back on the issue and produced a comment explaining why no implementation is appropriate.

Score 0-100 on whether the artifact correctly addresses the issue. Use the full range:

  0-25   — Misses the issue's intent, harmful, or unsupported by the code.
  26-50  — Addresses the issue partially or has obvious bugs / wrong scope.
  51-75  — Addresses the issue with reasonable scope; minor concerns; would
           need small revisions to merge.
  76-100 — Addresses the issue cleanly; right scope; sound approach.

Calibration anchors:
  - A diff that adds a guard rail the issue body explicitly requests, with
    matching tests, scopes correctly: 80-90.
  - A pushback that names the issue's exact failure mode, cites a more
    appropriate venue (e.g. "this belongs upstream / in skill / advisory
    not implementation"), and proposes 2-3 alternatives: 80-90.
  - A diff that does the wrong thing (fixes a different file, ignores the
    body's constraint, breaks an obvious invariant): 10-20.
  - A pushback that just refuses without engaging with the body: 10-20.

OUTPUT FORMAT — strict JSON, no prose around it:
{ "score": <integer 0-100>, "rationale": "<1-3 sentences>" }`;

// Order matters: more-specific patterns first. Branch names contain
// agent-ids, so the branch pattern runs before agent-id stripping
// (otherwise the agent-id regex eats the substring and the branch
// pattern finds nothing to match against).
const BLINDING_PATTERNS: { re: RegExp; replacement: string }[] = [
  // Branch names (matched before agent-id strip)
  { re: /\bvp-dev\/agent-[a-z0-9-]+\/issue-\d+(-incomplete-[^\s]+)?\b/gi, replacement: "<branch>" },
  // Trim-size hints: trim-50000, trim-22000-s52026
  { re: /\btrim-\d+(?:-s\d+)?\b/gi, replacement: "<trim>" },
  // Agent IDs like agent-916a, agent-916a-trim-50000-s52026 (after trim-size strip
  // so the trim-size suffix doesn't get absorbed into the agent-id replacement).
  { re: /\bagent-[a-z0-9]+(-[a-z0-9-]+)?\b/gi, replacement: "<agent>" },
  // Replicate index, e.g. "replicate=2", "rep=3", "-r3-"
  { re: /\b(?:replicate|rep)\s*[:=]\s*\d+\b/gi, replacement: "<rep>" },
  { re: /-r\d+-/g, replacement: "-r-" },
];

export function blindArtifact(artifact: string): string {
  let out = artifact;
  for (const { re, replacement } of BLINDING_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function buildUserPrompt(args: {
  issueTitle: string;
  issueBody: string;
  decision: Decision;
  artifact: string;
}): string {
  const artifactLabel =
    args.decision === "implement"
      ? "Agent's diff (unified format):"
      : "Agent's pushback comment:";
  return [
    `Issue: ${args.issueTitle}`,
    "",
    "--- Issue body ---",
    args.issueBody,
    "--- end body ---",
    "",
    `Decision: ${args.decision}`,
    "",
    artifactLabel,
    "```",
    args.artifact,
    "```",
    "",
    "Emit only the JSON object specified in the system prompt.",
  ].join("\n");
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function variance(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sq = xs.reduce((s, x) => s + (x - mean) ** 2, 0);
  return sq / (xs.length - 1);
}

export async function gradeReasoning(input: GradeReasoningInput): Promise<GradeReasoningResult> {
  const k = input.k ?? DEFAULT_K;
  const llm = input.llmCall ?? defaultLlmCall;

  if (input.decision === "error") {
    return {
      median: 0,
      scores: [],
      variance: 0,
      rationales: [],
      partialFailure: false,
      isError: true,
      errorReason: "decision === 'error' — not gradable",
    };
  }

  let artifact: string;
  if (input.decision === "implement") {
    if (!input.diff) {
      return {
        median: 0,
        scores: [],
        variance: 0,
        rationales: [],
        partialFailure: false,
        isError: true,
        errorReason: "decision === 'implement' but no diff supplied",
      };
    }
    artifact = blindArtifact(input.diff);
  } else {
    if (!input.pushbackComment) {
      return {
        median: 0,
        scores: [],
        variance: 0,
        rationales: [],
        partialFailure: false,
        isError: true,
        errorReason: "decision === 'pushback' but no comment supplied",
      };
    }
    artifact = blindArtifact(input.pushbackComment);
  }

  const userPrompt = buildUserPrompt({
    issueTitle: input.issueTitle,
    issueBody: input.issueBody,
    decision: input.decision,
    artifact,
  });

  const scores: number[] = [];
  const rationales: string[] = [];
  let totalCost = 0;
  let partialFailure = false;

  for (let i = 0; i < k; i++) {
    const result = await llm({
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      userPrompt,
      model: ORCHESTRATOR_MODEL_REASONING_JUDGE,
      sampleIndex: i,
    });
    if (typeof result.costUsd === "number") totalCost += result.costUsd;
    if (result.isError) {
      partialFailure = true;
      input.logger?.warn("judge.sample_failed", {
        issueId: input.issueId,
        sample: i,
        reason: result.errorReason,
      });
      continue;
    }
    const parsed = parseJsonEnvelope(result.raw, JUDGE_OUTPUT_SCHEMA);
    if (!parsed.ok || !parsed.value) {
      partialFailure = true;
      input.logger?.warn("judge.sample_unparseable", {
        issueId: input.issueId,
        sample: i,
        error: parsed.error,
      });
      continue;
    }
    scores.push(parsed.value.score);
    rationales.push(parsed.value.rationale);
  }

  if (scores.length === 0) {
    return {
      median: 0,
      scores: [],
      variance: 0,
      rationales: [],
      costUsd: totalCost > 0 ? totalCost : undefined,
      partialFailure,
      isError: true,
      errorReason: "all judge samples failed",
    };
  }

  return {
    median: median(scores),
    scores,
    variance: variance(scores),
    rationales,
    costUsd: totalCost > 0 ? totalCost : undefined,
    partialFailure,
    isError: false,
  };
}

async function defaultLlmCall(args: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  sampleIndex: number;
}): Promise<LlmCallResult> {
  let raw = "";
  let costUsd: number | undefined;
  try {
    const stream = query({
      // Salt the user prompt with the sample index so identical-prompt
      // K=3 calls don't collapse into the same response from cache. The
      // SDK / model still re-evaluates per-sample, but the salt makes it
      // explicit.
      prompt: `${args.userPrompt}\n\n[sample ${args.sampleIndex + 1} of K]`,
      options: {
        model: args.model,
        systemPrompt: args.systemPrompt,
        tools: [],
        permissionMode: "default",
        env: process.env,
        maxTurns: 1,
        settingSources: [],
        persistSession: false,
        pathToClaudeCodeExecutable: claudeBinPath(),
      },
    });
    for await (const msg of stream) {
      if (msg.type === "result") {
        if (msg.subtype === "success") {
          raw = msg.result;
          costUsd = msg.total_cost_usd;
        } else {
          return {
            raw: "",
            costUsd: msg.total_cost_usd,
            isError: true,
            errorReason: msg.subtype,
          };
        }
      }
    }
  } catch (err) {
    return { raw: "", isError: true, errorReason: (err as Error).message };
  }
  return { raw, costUsd, isError: false };
}
