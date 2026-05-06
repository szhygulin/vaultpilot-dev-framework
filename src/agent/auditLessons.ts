// Per-section intrinsic-quality audit of an agent's CLAUDE.md (Phase 1
// advisory; destructive Phase 2 deferred to a follow-up issue).
//
// Walks the agent's CLAUDE.md section-by-section. ONE LLM call per section
// (not batched) — that's what honors the "in vacuum" constraint. If the
// LLM saw siblings in the same prompt, it'd rate comparatively.
//
// Output: a scored proposal with per-section `intrinsicUtility` + verdict
// + rationale. Operator runs `vp-dev agents audit-lessons <agentId>` to
// see the table; combines with the reinforcement-based prune-lessons
// signal manually for now.
//
// The 0.0–1.0 scale is shared with summarizer.ts's write-time
// predictedUtility (via `src/util/utilityCalibration.ts`) so audit-time
// scores remain comparable to write-time scores.

import { z } from "zod";
import { promises as fs } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { agentClaudeMdPath } from "./specialization.js";
import { parseClaudeMdSections, type ParsedSection } from "./split.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_SUMMARIZER } from "../orchestrator/models.js";
import { UTILITY_CALIBRATION_ANCHOR } from "../util/utilityCalibration.js";

export const AUDIT_MODEL = ORCHESTRATOR_MODEL_SUMMARIZER;

export const DEFAULT_MAX_COST_USD = 5;
export const DEFAULT_CONCURRENCY = 3;

export const VERDICT_THRESHOLDS = {
  drop: 0.3, // < drop = "drop"
  keep: 0.6, // >= keep = "keep"; in between = "weak-keep"
} as const;

export type AuditVerdict = "keep" | "weak-keep" | "drop";

export interface AuditScore {
  sectionId: string;
  runId?: string;
  issueId?: number;
  heading: string;
  intrinsicUtility: number;
  verdict: AuditVerdict;
  rationale: string;
  costUsd: number;
}

export interface AuditProposal {
  agentId: string;
  generatedAt: string;
  /** Bytes of the agent's CLAUDE.md at audit time. */
  totalBytes: number;
  /** Number of sections parsed (only attributable, summarizer-emitted ones). */
  sectionCount: number;
  scores: AuditScore[];
  /** Sections found via parseClaudeMdSections that were not scored due to budget exhaustion. */
  unscoredSectionIds: string[];
  cost: {
    totalUsd: number;
    budgetUsd: number;
    budgetExhausted: boolean;
  };
  /** Mean intrinsicUtility across scored sections (NaN when no sections were scored). */
  meanUtility: number;
  /** Median intrinsicUtility across scored sections. */
  medianUtility: number;
  verdictCounts: { keep: number; weakKeep: number; drop: number };
}

const ScoreSchema = z.object({
  intrinsicUtility: z.number().min(0).max(1),
  rationale: z.string().min(1).max(500),
});

export interface AuditClient {
  scoreSection(input: {
    heading: string;
    body: string;
  }): Promise<{
    intrinsicUtility: number;
    rationale: string;
    costUsd: number;
  }>;
}

export interface ProposeAuditInput {
  agentId: string;
  maxCostUsd?: number;
  concurrency?: number;
  /** Override the LLM client (testability). Defaults to a sonnet-backed impl. */
  client?: AuditClient;
  /** Override the path of the agent's CLAUDE.md (testability). */
  claudeMdPathOverride?: string;
}

export async function proposeAudit(input: ProposeAuditInput): Promise<AuditProposal> {
  const generatedAt = new Date().toISOString();
  const budgetUsd = input.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const concurrency = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY);
  const client = input.client ?? defaultAuditClient();
  const filePath = input.claudeMdPathOverride ?? agentClaudeMdPath(input.agentId);

  let claudeMd = "";
  try {
    claudeMd = await fs.readFile(filePath, "utf-8");
  } catch {
    // Empty file → empty proposal; the operator sees "0 sections" rather
    // than a crash.
  }
  const totalBytes = Buffer.byteLength(claudeMd, "utf-8");
  const sections = parseClaudeMdSections(claudeMd);

  const scores: AuditScore[] = [];
  const unscoredSectionIds: string[] = [];
  let totalUsd = 0;
  let budgetExhausted = false;

  // Concurrent worker loop with strict budget gating: any worker that
  // observes totalUsd ≥ budgetUsd refuses to dispatch the next call. The
  // shared totalUsd counter is mutated under the JS event-loop's
  // single-thread guarantee — no lock needed.
  const queue: ParsedSection[] = [...sections];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      if (totalUsd >= budgetUsd) {
        budgetExhausted = true;
        break;
      }
      const section = queue.shift();
      if (!section) break;
      try {
        const result = await client.scoreSection({
          heading: section.heading,
          body: section.body,
        });
        totalUsd += result.costUsd;
        scores.push({
          sectionId: section.sectionId,
          runId: section.runId,
          issueId: section.issueId,
          heading: section.heading,
          intrinsicUtility: result.intrinsicUtility,
          verdict: utilityToVerdict(result.intrinsicUtility),
          rationale: result.rationale,
          costUsd: result.costUsd,
        });
      } catch {
        // Per-section failures are absorbed — the section is left unscored
        // (operator can re-run and only the missing ones get re-tried;
        // existing scores aren't lost since output is per-call).
        unscoredSectionIds.push(section.sectionId);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Anything still in the queue when the budget triggered counts as unscored.
  for (const s of queue) {
    unscoredSectionIds.push(s.sectionId);
  }

  // Stats.
  const utilities = scores.map((s) => s.intrinsicUtility);
  const meanUtility =
    utilities.length > 0
      ? utilities.reduce((a, b) => a + b, 0) / utilities.length
      : Number.NaN;
  const sortedUtils = [...utilities].sort((a, b) => a - b);
  const medianUtility =
    sortedUtils.length === 0
      ? Number.NaN
      : sortedUtils.length % 2 === 1
        ? sortedUtils[(sortedUtils.length - 1) / 2]
        : (sortedUtils[sortedUtils.length / 2 - 1] +
            sortedUtils[sortedUtils.length / 2]) /
          2;
  const verdictCounts = {
    keep: scores.filter((s) => s.verdict === "keep").length,
    weakKeep: scores.filter((s) => s.verdict === "weak-keep").length,
    drop: scores.filter((s) => s.verdict === "drop").length,
  };

  return {
    agentId: input.agentId,
    generatedAt,
    totalBytes,
    sectionCount: sections.length,
    scores,
    unscoredSectionIds,
    cost: { totalUsd, budgetUsd, budgetExhausted },
    meanUtility,
    medianUtility,
    verdictCounts,
  };
}

export function utilityToVerdict(utility: number): AuditVerdict {
  if (utility < VERDICT_THRESHOLDS.drop) return "drop";
  if (utility >= VERDICT_THRESHOLDS.keep) return "keep";
  return "weak-keep";
}

export function formatAuditProposal(p: AuditProposal): string {
  const lines: string[] = [];
  lines.push(`Audit proposal for ${p.agentId}`);
  lines.push(
    `  CLAUDE.md size: ${(p.totalBytes / 1024).toFixed(1)} KB; ${p.sectionCount} attributable section(s).`,
  );
  if (p.scores.length === 0) {
    lines.push("  No sections scored.");
    return lines.join("\n");
  }
  lines.push(
    `  intrinsicUtility:  mean=${p.meanUtility.toFixed(3)}  median=${p.medianUtility.toFixed(3)}`,
  );
  lines.push(
    `  verdicts: keep=${p.verdictCounts.keep} weak-keep=${p.verdictCounts.weakKeep} drop=${p.verdictCounts.drop}`,
  );
  lines.push(
    `  cost: $${p.cost.totalUsd.toFixed(4)} of $${p.cost.budgetUsd.toFixed(2)} budget${p.cost.budgetExhausted ? " (EXHAUSTED — partial result)" : ""}`,
  );
  if (p.unscoredSectionIds.length > 0) {
    lines.push(
      `  unscored: ${p.unscoredSectionIds.length} section(s) (budget exhausted or per-section error)`,
    );
  }
  // Sort by utility ascending so the operator sees worst-rated sections first.
  const sorted = [...p.scores].sort((a, b) => a.intrinsicUtility - b.intrinsicUtility);
  for (const s of sorted) {
    const verdictTag = s.verdict === "drop" ? "drop  " : s.verdict === "weak-keep" ? "weak  " : "keep  ";
    const headingPreview = s.heading.length > 80 ? s.heading.slice(0, 77) + "..." : s.heading;
    lines.push(
      `  [${verdictTag}] ${s.sectionId} (util=${s.intrinsicUtility.toFixed(2)}) "${headingPreview}"`,
    );
    lines.push(`    rationale: ${s.rationale}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Default sonnet-backed AuditClient implementation
// ---------------------------------------------------------------------

const AUDIT_SYSTEM_PROMPT = `You are an audit agent. Given a single section from an agent's CLAUDE.md, rate its intrinsic utility on a 0.0–1.0 scale. The rating is IN VACUUM — you do not see other sections, run history, or whether the section ever fired in production. Score the section's text on its own merits.

Calibration (same scale as the write-time predictedUtility self-rating):
${UTILITY_CALIBRATION_ANCHOR}

Be calibrated, not generous. A pile of 0.7s is useless. If the section is generic, mark it 0.1–0.3. If it cites a dated past incident with concrete file paths or function names, mark it 0.9–1.0.

Output: a single JSON object, no fences, no prose. Schema:
  {"intrinsicUtility": number, "rationale": string}

The rationale must be ONE short sentence (≤ 200 chars) naming the specific evidence — what makes this section concrete or generic. Do NOT include "this section" / "this rule" — name the property directly: "no past incident anchor", "cites src/foo.ts:42", "tautological", etc.`;

function buildAuditUserPrompt(input: { heading: string; body: string }): string {
  return `Section heading: ${input.heading}

Section body:
${input.body}

Rate it. Emit one JSON object.`;
}

export function defaultAuditClient(): AuditClient {
  return {
    async scoreSection(input) {
      const userPrompt = buildAuditUserPrompt(input);
      let raw = "";
      let costUsd = 0;
      const stream = query({
        prompt: userPrompt,
        options: {
          model: AUDIT_MODEL,
          systemPrompt: AUDIT_SYSTEM_PROMPT,
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
          if (msg.subtype === "success") raw = msg.result;
          else throw new Error(`audit query failed: ${msg.subtype}`);
          // Pull cost when available (mirrors codingAgent.ts pattern).
          const m = msg as { total_cost_usd?: number };
          if (typeof m.total_cost_usd === "number") costUsd = m.total_cost_usd;
        }
      }
      const parsed = parseJsonEnvelope(raw, ScoreSchema);
      if (!parsed.ok) {
        throw new Error(`audit output not valid: ${parsed.error}`);
      }
      return {
        intrinsicUtility: parsed.value!.intrinsicUtility,
        rationale: parsed.value!.rationale,
        costUsd,
      };
    },
  };
}
