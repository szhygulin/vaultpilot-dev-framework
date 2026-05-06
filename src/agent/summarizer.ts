import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_SUMMARIZER } from "../orchestrator/models.js";
import { accuracyDegradationFactor } from "../util/contextCostCurve.js";
import type { AgentRecord, IssueSummary, ResultEnvelope } from "../types.js";
import type { Logger } from "../log/logger.js";

// Resolved at module load from `models.ts` (env-overridable). See
// `src/orchestrator/models.ts` for tier rationale and override env vars.
const SUMMARIZER_MODEL = ORCHESTRATOR_MODEL_SUMMARIZER;

const HEADING_MAX = 120;
const BODY_MAX = 2000;

export const SummarizerOutputSchema = z.object({
  // Default false: action-case payloads ({heading, body}) routinely omit
  // skip. The prompt's prose treats absence as "not skipping" — the LLM
  // only includes skip:true when it explicitly chooses to skip. Defaulting
  // matches that intent and keeps the rare-but-legitimate omission from
  // discarding an otherwise-valid lesson. The prompt still asks for the
  // field explicitly (suspenders), this is the belt.
  skip: z.boolean().default(false),
  skipReason: z.string().optional(),
  heading: z.string().min(3).max(HEADING_MAX).optional(),
  body: z.string().min(3).max(BODY_MAX).optional(),
  // #179 Phase 2 (option B from the cost/benefit menu, shipped early as a
  // half-ready-curve data probe): the LLM's self-rating of how much
  // future-leverage the lesson carries. 0 = restates an existing rule or
  // captures a generic platitude; 1 = names a specific past failure with
  // date/PR/file path that the agent would otherwise repeat. Optional for
  // back-compat with summarizer responses pre-this-change; missing field
  // means the gate in `runIssueCore.maybeAppendSummary` lets the lesson
  // through (no signal to act on). Persisted into
  // `SectionUtilityRecord.predictedUtility` so post-hoc analysis can
  // correlate self-ratings with actual reinforcement.
  predictedUtility: z.number().min(0).max(1).optional(),
});
export type SummarizerOutput = z.infer<typeof SummarizerOutputSchema>;

export interface SummarizerInput {
  agent: AgentRecord;
  issue: IssueSummary;
  envelope: ResultEnvelope;
  toolUseTrace: { tool: string; input: string }[];
  finalText: string;
  logger: Logger;
  /**
   * Current size of the agent's CLAUDE.md, in bytes. Threaded by
   * `runIssueCore` from a `Buffer.byteLength` of the file just before this
   * summarizer call. Surfaced in the prompt as a marginal-cost transparency
   * signal (#179 Phase 1, option F): the LLM sees what its proposed lesson
   * will cost on the empirical accuracy-degradation curve before it commits.
   * No gating — the LLM's existing "no GENERALIZABLE rule → skip" hard-rule
   * absorbs cost-awareness on its own terms. Optional for back-compat with
   * call sites that pre-date this field; absence drops the line from the
   * prompt rather than failing.
   */
  currentClaudeMdBytes?: number;
}

export async function summarizeRun(input: SummarizerInput): Promise<SummarizerOutput> {
  return runSummarizerQuery({
    agent: input.agent,
    issue: input.issue,
    systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
    userPrompt: buildPrompt(input),
    logger: input.logger,
  });
}

export interface FailureSummarizerInput {
  agent: AgentRecord;
  issue: IssueSummary;
  // Optional — when the SDK or the agent crashed before producing an
  // envelope, only errorReason is populated.
  envelope?: ResultEnvelope;
  errorReason?: string;
  toolUseTrace: { tool: string; input: string }[];
  finalText: string;
  logger: Logger;
  /** See `SummarizerInput.currentClaudeMdBytes`. */
  currentClaudeMdBytes?: number;
}

export async function summarizeFailureRun(
  input: FailureSummarizerInput,
): Promise<SummarizerOutput> {
  return runSummarizerQuery({
    agent: input.agent,
    issue: input.issue,
    systemPrompt: FAILURE_SUMMARIZER_SYSTEM_PROMPT,
    userPrompt: buildFailurePrompt(input),
    logger: input.logger,
  });
}

// Pattern-match SDK / GitHub / filesystem transport errors that have no
// learning value. Anything that doesn't match here is treated as a genuine
// failure worth distilling into a lesson.
const INFRA_FLAKE_PATTERNS: RegExp[] = [
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bENOTFOUND\b/i,
  /\bEPIPE\b/i,
  /\bETIMEDOUT\b/i,
  /\baborted?\b/i,
  /\btimed out\b/i,
  /\btimeout\b/i,
  /\bsocket hang up\b/i,
  /\bnetwork error\b/i,
  /\bfetch failed\b/i,
  // GitHub API 5xx surfaces from gh / api wrappers.
  /\bHTTP 5\d\d\b/,
  /\bstatus(?:Code)?[:\s]+5\d\d\b/i,
  // Worktree / filesystem-level failures.
  /\bworktree\b[\s\S]{0,80}\b(?:fail|create|init|exists|locked)\b/i,
  /\bENOENT\b/,
  /\bEACCES\b/,
  /\bENOSPC\b/,
];

export function isInfraFlake(reason: string | undefined | null): boolean {
  if (!reason) return false;
  return INFRA_FLAKE_PATTERNS.some((re) => re.test(reason));
}

interface SummarizerQueryArgs {
  agent: AgentRecord;
  issue: IssueSummary;
  systemPrompt: string;
  userPrompt: string;
  logger: Logger;
}

async function runSummarizerQuery(args: SummarizerQueryArgs): Promise<SummarizerOutput> {
  let raw = "";
  try {
    const stream = query({
      prompt: args.userPrompt,
      options: {
        model: SUMMARIZER_MODEL,
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
        if (msg.subtype === "success") raw = msg.result;
        else {
          args.logger.warn("specialization.summarizer_failed", {
            agentId: args.agent.agentId,
            issueId: args.issue.id,
            subtype: msg.subtype,
          });
          return { skip: true, skipReason: `summarizer query failed: ${msg.subtype}` };
        }
      }
    }
  } catch (err) {
    args.logger.warn("specialization.summarizer_failed", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      err: (err as Error).message,
    });
    return { skip: true, skipReason: `summarizer exception: ${(err as Error).message}` };
  }

  // Extract the JSON envelope without schema validation — we still need a
  // clamp pass on raw heading/body lengths before SummarizerOutputSchema
  // can be applied. `z.unknown()` makes the helper return whatever parses,
  // delegating validation to the safeParse below.
  const extracted = parseJsonEnvelope(raw, z.unknown());
  if (!extracted.ok) {
    args.logger.warn("summarizer.malformed_payload", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      raw: raw.slice(0, 4000),
    });
    return { skip: true, skipReason: "summarizer output not valid JSON" };
  }
  const json = extracted.value;

  // Post-parse safety net: clamp oversize heading/body BEFORE schema
  // validation so the entire summary isn't discarded just because the LLM
  // ignored the prompt's length directive. The schema's max bounds still
  // act as a hard ceiling — clamping happens against those same constants.
  const clamped = clampLengthsCompat(json, args.logger, args.agent.agentId, args.issue.id);

  const parsed = SummarizerOutputSchema.safeParse(clamped);
  if (!parsed.success) {
    args.logger.warn("summarizer.malformed_payload", {
      agentId: args.agent.agentId,
      issueId: args.issue.id,
      raw: raw.slice(0, 4000),
      zodError: parsed.error.message.replace(/\s+/g, " "),
    });
    return { skip: true, skipReason: `summarizer schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 400)}` };
  }
  if (!parsed.data.skip && (!parsed.data.heading || !parsed.data.body)) {
    return { skip: true, skipReason: "missing heading or body" };
  }
  return parsed.data;
}

function clampLengthsCompat(
  json: unknown,
  logger: Logger,
  agentId: string,
  issueId: number,
): unknown {
  if (!json || typeof json !== "object") return json;
  const obj = json as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  if (typeof obj.heading === "string" && obj.heading.length > HEADING_MAX) {
    out.heading = obj.heading.slice(0, HEADING_MAX - 3) + "...";
    logger.warn("summarizer.clamped", {
      agentId,
      issueId,
      field: "heading",
      originalLength: obj.heading.length,
      max: HEADING_MAX,
    });
  }
  if (typeof obj.body === "string" && obj.body.length > BODY_MAX) {
    out.body = obj.body.slice(0, BODY_MAX - 16) + "\n[…truncated]";
    logger.warn("summarizer.clamped", {
      agentId,
      issueId,
      field: "body",
      originalLength: obj.body.length,
      max: BODY_MAX,
    });
  }
  return out;
}

const SUMMARIZER_SYSTEM_PROMPT = `You are a distillation agent. After a coding agent has finished work on a single GitHub issue, your job is to extract any GENERALIZABLE rule that should bind the agent's behavior on FUTURE similar issues — and append it to the agent's evolving CLAUDE.md.

Style: match the dense rule-form of an existing CLAUDE.md section. Lead with the rule itself in bold. Then a **Why:** line (the reason — often a past incident, a hidden constraint, a strong preference). Then a **How to apply:** line (when this guidance kicks in). Use **Tells:** sparingly to list signals of the situation. Markdown hyperlinks (\`[label](url)\`) over raw URLs.

Cross-agent promotion (optional, gated by human review):
- If a piece of the lesson would help SIBLING agents in the same domain — not just THIS agent — wrap that piece inside the \`body\` between two HTML comments:
    <!-- promote-candidate:<domain> -->
    <descriptive observation, multiple lines OK>
    <!-- /promote-candidate -->
- The \`<domain>\` MUST be one of the agent's current tags listed under "Pre-run agent tags" or "Tags added this run" — that's how we keep domain taxonomy stable.
- The wrapped content must read as a DESCRIPTIVE OBSERVATION, not an instruction to other agents. Avoid "you must / should", "the agent must" — use indicative voice: "Solana RPC X behaves like Y" / "ERC-4626 rounds shares DOWN on deposit".
- Cap the wrapped content at ~40 non-empty lines / ~1500 chars. Anything longer is too coarse to share.
- Promote-candidates are queued for human review; they do NOT auto-promote. Use sparingly — most lessons stay agent-local.

Project-wide promotion (rare, gated by stricter review):
- If a piece of the lesson would help EVERY agent dispatched on this repo — a process habit, a pre-dispatch check, a harness gotcha, a build/CI rule — wrap that piece with the special domain \`@local-claude\` and an explicit utility self-rating:
    <!-- promote-candidate:@local-claude utility=0.X -->
    <descriptive observation, multiple lines OK>
    <!-- /promote-candidate -->
- Reserve for genuine project-tooling discipline. NOT for crypto specialties or domain-specific facts (those use the regular \`<domain>\` form above) — those have a per-domain audience, not project-wide.
- The \`utility=0.X\` value (in [0, 1]) MUST be present for \`@local-claude\` candidates. The harness gates these against project-local CLAUDE.md cost at a stricter ratio (default 2.0 vs 1.0 for personal lessons), because bytes added there are loaded into every dispatch's prompt by every agent. Calibrate honestly: 0.7+ for genuinely project-wide rules with concrete tells, 0.4–0.6 for borderline (likely to be rejected by the L2 gate), below that don't bother wrapping.
- Same descriptive-observation voice rule as cross-agent promotion above.

Hard rules:
- If there is no GENERALIZABLE lesson — only a one-off fix, a routine implementation, a trivial pushback — return {"skip": true, "skipReason": "<one short sentence>"}. Empty learnings beat noisy ones.
- If the agent failed (decision="error"), default to skip unless there's a clear lesson about the failure mode itself.
- Heading: ≤ 120 chars, no trailing colon, no markdown prefix (no leading "##"). The append step prepends "##".
- Body: ≤ 2000 chars. 2–8 short lines. No prose paragraphs.
- Do NOT mention the specific issue number, PR number, or run id — that's in the provenance comment. Talk about the class of situation, not this instance.
- Inside heading / body / skipReason string values: escape every double-quote as \\" and every literal newline as \\n. Do NOT escape apostrophes — \\' is INVALID JSON (the parser only knows \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, \\uXXXX). Write apostrophes as a plain ': don't, isn't, can't. Prefer single-quote ' or backticks for emphasis when the alternative is acceptable.

Predicted-utility self-rating (issue #179, half-ready-curve probe):
- For every non-skip emission, ALSO emit \`predictedUtility\` — a number in [0, 1] estimating how much future-leverage the lesson carries. The harness uses this to decide whether the lesson's expected benefit justifies the byte-cost in the cost-transparency line above; it gets persisted so the operator can later correlate self-ratings with whether the lesson actually fired (got reinforced by future runs).
- Calibration:
  - 0.0–0.2: restates an existing rule; generic platitude ("verify before merging"); applies-to-everything; adds little beyond rules already in the file.
  - 0.3–0.5: useful but partially redundant or could be inferred from existing sections; modest sharpening of an already-known principle.
  - 0.6–0.8: introduces a specific rule with a named failure mode the agent has hit before or would hit again; cites concrete files / tools / protocols.
  - 0.9–1.0: names a specific past incident (date / PR / file path / function name) with a concrete failure mode the agent would otherwise repeat; high-leverage rule with narrow tells.
- Be calibrated, not generous. A field full of 0.8s is useless for tuning. If you'd skip the lesson under the cost-transparency line above, mark it 0.1–0.3 instead of inflating.

Output: a single JSON object, no fences, no prose. The \`skip\` field is MANDATORY in every response. Use \`{"skip": false, "heading": "...", "body": "...", "predictedUtility": 0.X}\` when there is a lesson worth saving, and \`{"skip": true, "skipReason": "..."}\` otherwise. Schema:
  {"skip": boolean, "skipReason"?: string, "heading"?: string, "body"?: string, "predictedUtility"?: number}`;

const FAILURE_SUMMARIZER_SYSTEM_PROMPT = `You are a distillation agent. A coding agent JUST FAILED on a single GitHub issue — CI red after retry, agent gave up, envelope decision="error", or the SDK crashed mid-run after producing partial work. Your job is to extract the highest-signal failure lesson worth committing to the agent's CLAUDE.md.

Failure-mode bias: lean toward EMITTING a lesson, not skipping. The whole point of this path is that today these signals are discarded — assume there is something worth saying unless the failure is genuinely opaque.

Three questions to anchor the body:
1. What did the agent ASSUME that turned out wrong?
2. What CONTEXT or TOOLING was missing — what would have unblocked it?
3. What GUARD RULE, written tersely, would have prevented this on the next similar issue?

Style: match the dense rule-form of an existing CLAUDE.md section. Lead with the rule itself in bold. Then a **Why:** line (the failure mode this targets). Then a **How to apply:** line (when this guidance kicks in). Use **Tells:** sparingly. Markdown hyperlinks (\`[label](url)\`) over raw URLs.

Cross-agent promotion (optional, gated by human review):
- If the failure mode is STRUCTURAL — a fact about the SDK, the tooling, the protocol, or the framework that any sibling agent in the same domain would hit the same way — wrap the cross-agent useful piece inside the \`body\` between two HTML comments:
    <!-- promote-candidate:<domain> -->
    <descriptive observation, multiple lines OK>
    <!-- /promote-candidate -->
- The \`<domain>\` MUST be one of the agent's current tags listed under "Pre-run agent tags" or "Tags added this run".
- Use SPARINGLY — most failure lessons are agent-internal artifacts (this agent's tool sequencing was inefficient, this agent burned turns on a config quirk, context-window bloat). Those stay agent-local and MUST NOT be wrapped. Only structural facts ("Anthropic SDK X has known shape Y", "ERC-4626 reverts on zero-share deposit", "Solana RPC Z drops txs above N CU") earn the wrapper.
- The wrapped content must read as a DESCRIPTIVE OBSERVATION, not an instruction to other agents. Avoid "you must / should", "the agent must" — use indicative voice.
- Cap the wrapped content at ~40 non-empty lines / ~1500 chars.
- Promote-candidates are queued for human review; they do NOT auto-promote. The human reviewer rejects noise.

Project-wide promotion (rare, gated by stricter review):
- If the failure mode is a project-tooling habit that EVERY agent dispatched on this repo would benefit from (pre-dispatch checks, harness gotchas, dispatch-flow rules), wrap that piece with the special domain \`@local-claude\` and an explicit utility self-rating:
    <!-- promote-candidate:@local-claude utility=0.X -->
    <descriptive observation, multiple lines OK>
    <!-- /promote-candidate -->
- Reserve for genuine project-tooling discipline — NOT for SDK/protocol/specialty facts (those use the regular \`<domain>\` form). The harness gates these against project-local CLAUDE.md cost at a stricter ratio (default 2.0 vs 1.0 for personal). Calibrate honestly: 0.7+ for genuinely project-wide rules with concrete tells, 0.4–0.6 for borderline. Same descriptive-observation voice rule.

Predicted-utility self-rating (issue #179, half-ready-curve probe):
- For every non-skip failure-lesson emission, ALSO emit \`predictedUtility\` — a number in [0, 1] estimating how much future-leverage the lesson carries. Failure lessons skew higher than success lessons because they capture signal that's normally lost; calibration:
  - 0.0–0.3: agent burned turns on a one-off configuration quirk; lesson is "this run was unlucky"; nothing repeatable.
  - 0.4–0.7: lesson names a specific tooling / SDK / protocol shape the agent didn't anticipate but a sibling agent would.
  - 0.8–1.0: lesson names a structural fact (with concrete file path / function / protocol field) that prevents the same failure mode on the next similar issue. Strong candidate for cross-agent promotion if wrapped.
- Be calibrated, not generous. The harness gates appends on this score; inflating it wastes the byte-budget on weak lessons.

Hard rules:
- If the failure was genuinely uninformative (single ambiguous error string, no agent reasoning, no clear missed assumption), emit \`{"skip": true, "skipReason": "<one short sentence>"}\`. Wrong-lesson risk beats noisy-lesson risk.
- Heading: ≤ 120 chars, no trailing colon, no markdown prefix (no leading "##"). The append step prepends "##".
- Body: ≤ 2000 chars. 2–8 short lines. No prose paragraphs.
- Do NOT mention the specific issue number, PR number, or run id — that's in the provenance comment. Talk about the class of failure, not this instance.
- Inside heading / body / skipReason string values: escape every double-quote as \\" and every literal newline as \\n. Do NOT escape apostrophes — \\' is INVALID JSON. Write apostrophes as a plain ': don't, isn't, can't.

Output: a single JSON object, no fences, no prose. The \`skip\` field is MANDATORY in every response. Schema:
  {"skip": boolean, "skipReason"?: string, "heading"?: string, "body"?: string, "predictedUtility"?: number}`;

export function buildFailurePrompt(input: FailureSummarizerInput): string {
  const trace = input.toolUseTrace
    .slice(-12)
    .map((t) => `- ${t.tool}: ${t.input}`)
    .join("\n");

  const decisionLine = input.envelope
    ? `Decision: ${input.envelope.decision}`
    : "Decision: <no envelope — agent crashed before emitting one>";
  const reasonLine = input.envelope ? `Reason: ${input.envelope.reason}` : "";
  const errorLine = input.errorReason ? `SDK / runtime error: ${input.errorReason}` : "";
  const tagsAdded = input.envelope ? JSON.stringify(input.envelope.memoryUpdate.addTags) : "[]";
  const tagsRemoved = input.envelope
    ? JSON.stringify(input.envelope.memoryUpdate.removeTags ?? [])
    : "[]";

  const costLine = buildCostTransparencyLine(input.currentClaudeMdBytes);

  return `Agent ${input.agent.agentId} just FAILED work on an issue. Distill the lesson.

Issue:
  number: ${input.issue.id}
  title: ${input.issue.title}
  labels: ${JSON.stringify(input.issue.labels)}

Pre-run agent tags: ${JSON.stringify(input.agent.tags)}
Tags added this run: ${tagsAdded}
Tags removed this run: ${tagsRemoved}

${decisionLine}
${reasonLine}
${errorLine}

Last tool calls (most recent ${Math.min(12, input.toolUseTrace.length)}):
${trace || "(none captured)"}

Agent's final reasoning text (truncated):
${truncate(input.finalText, 4000)}
${costLine}

Decide: is there a generalizable failure lesson worth committing to this agent's CLAUDE.md? Lean toward yes — failure-mode runs exist to capture signal that success-mode discards. If yes, emit {"skip": false, "heading": "...", "body": "...", "predictedUtility": 0.X}. If the failure is genuinely opaque, emit {"skip": true, "skipReason": "..."}. The skip field is mandatory in both shapes; predictedUtility is mandatory whenever skip=false. JSON only — escape every \\" inside string values.`;
}

export function buildPrompt(input: SummarizerInput): string {
  const trace = input.toolUseTrace
    .slice(-12)
    .map((t) => `- ${t.tool}: ${t.input}`)
    .join("\n");
  const costLine = buildCostTransparencyLine(input.currentClaudeMdBytes);

  return `Agent ${input.agent.agentId} just finished work.

Issue:
  number: ${input.issue.id}
  title: ${input.issue.title}
  labels: ${JSON.stringify(input.issue.labels)}

Pre-run agent tags: ${JSON.stringify(input.agent.tags)}
Tags added this run: ${JSON.stringify(input.envelope.memoryUpdate.addTags)}
Tags removed this run: ${JSON.stringify(input.envelope.memoryUpdate.removeTags ?? [])}

Decision: ${input.envelope.decision}
Reason: ${input.envelope.reason}
${input.envelope.prUrl ? `PR: ${input.envelope.prUrl}` : ""}
${input.envelope.commentUrl ? `Comment: ${input.envelope.commentUrl}` : ""}
${input.envelope.scopeNotes ? `Scope notes: ${input.envelope.scopeNotes}` : ""}

Last tool calls (most recent ${Math.min(12, input.toolUseTrace.length)}):
${trace || "(none captured)"}

Agent's final reasoning text (truncated):
${truncate(input.finalText, 4000)}
${costLine}

Decide: is there a generalizable rule worth committing to this agent's CLAUDE.md? If yes, emit {"skip": false, "heading": "...", "body": "...", "predictedUtility": 0.X}. If no, emit {"skip": true, "skipReason": "..."}. The skip field is mandatory in both shapes; predictedUtility is mandatory whenever skip=false. JSON only — escape every \\" inside string values.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

/**
 * Render a marginal-cost transparency line for the summarizer prompt. Returns
 * an empty string when `currentClaudeMdBytes` is undefined (back-compat) or
 * when the curve evaluates to NaN (e.g., zero-byte file before fork). The
 * line cites #179 so the LLM has provenance for the prediction.
 *
 * The "added bytes" estimate uses the schema's HEADING_MAX (120) + BODY_MAX
 * (2000) caps as an upper bound — the actual lesson will usually be smaller,
 * making this a *worst-case* cost estimate. We don't see the body before the
 * call, so this is the tightest forecast available without a chicken-and-egg.
 */
export function buildCostTransparencyLine(currentBytes: number | undefined): string {
  if (currentBytes == null || !Number.isFinite(currentBytes) || currentBytes <= 0) {
    return "";
  }
  const upperBoundAddedBytes = HEADING_MAX + BODY_MAX + 200; // 200 for sentinel + headings
  const factorNow = accuracyDegradationFactor(currentBytes);
  const factorAfter = accuracyDegradationFactor(currentBytes + upperBoundAddedBytes);
  if (!Number.isFinite(factorNow) || !Number.isFinite(factorAfter)) return "";
  const kbNow = (currentBytes / 1024).toFixed(1);
  const kbAfter = ((currentBytes + upperBoundAddedBytes) / 1024).toFixed(1);
  return [
    "",
    "Marginal cost of adding a lesson here (linear-log accuracy fit, #179):",
    `  CLAUDE.md is currently ${kbNow} KB (predicted accuracy degradation factor ${factorNow.toFixed(3)}).`,
    `  Adding a worst-case lesson grows it to ~${kbAfter} KB (factor ~${factorAfter.toFixed(3)}).`,
    `  Skip if the lesson isn't carrying weight — every byte degrades future runs.`,
  ].join("\n");
}

