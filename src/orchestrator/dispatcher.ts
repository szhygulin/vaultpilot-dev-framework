import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildTickPrompt } from "./prompt.js";
import { claudeBinPath } from "../agent/sdkBinary.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { TickProposalSchema, type TickAssignment } from "../types.js";
import {
  classifyMatch,
  deterministicFallback,
  isGeneralist,
  isTwoPhaseRoutingEnabled,
} from "./routing.js";
import type { AgentRecord, IssueSummary } from "../types.js";
import type { Logger } from "../log/logger.js";
import type { RunCostTracker } from "../util/costTracker.js";

export interface DispatchInput {
  idleAgents: AgentRecord[];
  pendingIssues: IssueSummary[];
  cap: number;
  logger: Logger;
  /**
   * Per-run cost accumulator (issue #85 Phase 1). Measurement only:
   * dispatcher's per-tick `query()` cost is forwarded to the tracker so
   * the run total includes orchestrator-side spend alongside the larger
   * coding-agent cost.
   */
  costTracker?: RunCostTracker;
  /**
   * Issue #84: per-run agent override. Surfaced to the LLM dispatcher as
   * a hard rule and forwarded to the deterministic fallback so the
   * preferred agent's score gets the +PREFER_AGENT_BUMP nudge there too.
   * If the LLM proposal omits the preferred agent while it's still idle
   * and at least one issue is pending, validation fails and the run
   * falls through to the retry → deterministic fallback path which
   * always picks it first.
   */
  preferAgentId?: string;
}

export interface DispatchResult {
  assignments: TickAssignment[];
  source: "llm" | "llm-retry" | "fallback";
}

const ORCHESTRATOR_MODEL = "claude-sonnet-4-6";

export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  const cap = Math.min(input.cap, input.idleAgents.length, input.pendingIssues.length);
  if (cap <= 0) return { assignments: [], source: "llm" };

  const firstAttempt = await tryProposeWithLLM({
    pendingIssues: input.pendingIssues,
    idleAgents: input.idleAgents,
    cap,
    logger: input.logger,
    costTracker: input.costTracker,
    preferAgentId: input.preferAgentId,
  });
  if (firstAttempt.assignments) {
    return { assignments: firstAttempt.assignments, source: "llm" };
  }

  input.logger.warn("dispatcher.proposal_invalid", {
    errors: firstAttempt.errors,
    attempt: 1,
  });

  const retry = await tryProposeWithLLM({
    pendingIssues: input.pendingIssues,
    idleAgents: input.idleAgents,
    cap,
    logger: input.logger,
    errorsFromPrior: firstAttempt.errors,
    costTracker: input.costTracker,
    preferAgentId: input.preferAgentId,
  });
  if (retry.assignments) {
    return { assignments: retry.assignments, source: "llm-retry" };
  }

  input.logger.warn("dispatcher.proposal_invalid", {
    errors: retry.errors,
    attempt: 2,
  });

  const fallback = deterministicFallback({
    idleAgents: input.idleAgents,
    pendingIssues: input.pendingIssues,
    cap,
    preferAgentId: input.preferAgentId,
  });
  return { assignments: fallback, source: "fallback" };
}

interface ProposeOutcome {
  assignments?: TickAssignment[];
  errors?: string[];
}

async function tryProposeWithLLM(opts: {
  pendingIssues: IssueSummary[];
  idleAgents: AgentRecord[];
  cap: number;
  logger: Logger;
  errorsFromPrior?: string[];
  costTracker?: RunCostTracker;
  preferAgentId?: string;
}): Promise<ProposeOutcome> {
  const prompt = buildTickPrompt({
    pendingIssues: opts.pendingIssues,
    idleAgents: opts.idleAgents,
    cap: opts.cap,
    errorsFromPrior: opts.errorsFromPrior,
    preferAgentId: opts.preferAgentId,
  });

  let raw = "";
  try {
    const stream = query({
      prompt,
      options: {
        model: ORCHESTRATOR_MODEL,
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
        // Forward whether success or error subtype — the SDK reports cost
        // for both, and a failed dispatch still consumed tokens.
        opts.costTracker?.add(msg.total_cost_usd);
        if (msg.subtype === "success") raw = msg.result;
        else return { errors: [`Orchestrator query failed: ${msg.subtype}`] };
      }
    }
  } catch (err) {
    return { errors: [`Orchestrator query exception: ${(err as Error).message}`] };
  }

  opts.logger.info("tick.llm_io", {
    promptBytes: prompt.length,
    responseBytes: raw.length,
    response: raw.length > 4000 ? raw.slice(0, 4000) + "..." : raw,
  });

  const proposal = parseJsonEnvelope(raw, TickProposalSchema);
  if (!proposal.ok || !proposal.value) {
    return { errors: [proposal.error ?? "Orchestrator response is not valid JSON."] };
  }

  const errors = validateProposal({
    proposal: proposal.value.assignments,
    cap: opts.cap,
    idleAgents: opts.idleAgents,
    pendingIssues: opts.pendingIssues,
    preferAgentId: opts.preferAgentId,
  });
  if (errors.length > 0) return { errors };
  return { assignments: proposal.value.assignments };
}

interface ValidateInput {
  proposal: TickAssignment[];
  cap: number;
  idleAgents: AgentRecord[];
  pendingIssues: IssueSummary[];
  preferAgentId?: string;
}

function validateProposal(input: ValidateInput): string[] {
  const errors: string[] = [];
  const idleSet = new Set(input.idleAgents.map((a) => a.agentId));
  const pendingSet = new Set(input.pendingIssues.map((i) => i.id));

  if (input.proposal.length > input.cap) {
    errors.push(`Too many assignments: ${input.proposal.length} > cap ${input.cap}`);
  }

  // Issue #84: when --prefer-agent is active and the preferred agent is
  // idle with at least one pending issue, the LLM proposal MUST include
  // an assignment for it. Otherwise fail validation — the retry prompt
  // surfaces the omission, and the deterministic fallback path picks the
  // preferred agent first via its +PREFER_AGENT_BUMP score.
  if (
    input.preferAgentId !== undefined &&
    idleSet.has(input.preferAgentId) &&
    input.pendingIssues.length > 0 &&
    !input.proposal.some((a) => a.agentId === input.preferAgentId)
  ) {
    errors.push(
      `Preferred agent ${input.preferAgentId} (--prefer-agent) is idle but missing from the proposal. Assign it to one of the pending issues.`,
    );
  }

  // The "true cap" — how many assignments are ACTUALLY dispatchable, given
  // matching constraints. In single-phase mode this equals input.cap (any
  // agent×issue pair is acceptable). In two-phase mode we count specialist
  // pairs first, then generalist seats for unmatched issues — empty slots
  // beyond that are correct, not a bug.
  const trueCap = computeTrueCap(input);

  // Under-dispatch wastes parallelism: when assignments < trueCap the
  // dispatcher left a dispatchable slot empty. Past incident 2026-05-01:
  // dispatcher returned 1 assignment at tick 2 with cap=2 (both agents
  // idle, both issues pending), costing a 10-min wall-clock gap before the
  // next tick re-tried. Treating under-dispatch as a validation error
  // triggers the retry → deterministic fallback path which always fills.
  if (trueCap > 0 && input.proposal.length < trueCap) {
    errors.push(
      `Under-dispatch: ${input.proposal.length} assignments < trueCap ${trueCap}. Fill every dispatchable slot — empty slots beyond what specialists+generalists can cover are fine.`,
    );
  }

  const seenAgents = new Set<string>();
  const seenIssues = new Set<number>();
  for (const a of input.proposal) {
    if (!idleSet.has(a.agentId)) errors.push(`agentId ${a.agentId} is not idle / unknown.`);
    if (!pendingSet.has(a.issueId)) errors.push(`issueId ${a.issueId} is not pending / out of range.`);
    if (seenAgents.has(a.agentId)) errors.push(`agent ${a.agentId} assigned twice.`);
    if (seenIssues.has(a.issueId)) errors.push(`issue ${a.issueId} assigned twice.`);
    seenAgents.add(a.agentId);
    seenIssues.add(a.issueId);
  }
  return errors;
}

/**
 * In single-phase mode (legacy), every agent×issue pair is dispatchable so
 * the true cap is just input.cap. In two-phase mode, count how many issues
 * have a specialist match; the remainder need a generalist agent. The
 * dispatchable count is bounded by both.
 */
function computeTrueCap(input: ValidateInput): number {
  const cap = Math.min(input.cap, input.idleAgents.length, input.pendingIssues.length);
  if (!isTwoPhaseRoutingEnabled()) return cap;

  const specialistAgents = new Set<string>();
  const matchedIssues = new Set<number>();
  for (const a of input.idleAgents) {
    for (const i of input.pendingIssues) {
      if (classifyMatch(a, i) === "specialist") {
        specialistAgents.add(a.agentId);
        matchedIssues.add(i.id);
      }
    }
  }
  // Specialist seats: each specialist agent can take at most one issue per
  // tick, but only if at least one of its specialty issues is still available
  // — bound by min(specialistAgents, matchedIssues).
  const specialistSeats = Math.min(specialistAgents.size, matchedIssues.size);

  // Generalist seats: idle generalists × unmatched issues.
  const generalistAgents = input.idleAgents.filter(
    (a) => !specialistAgents.has(a.agentId) && isGeneralist(a),
  );
  const unmatchedIssues = input.pendingIssues.filter((i) => !matchedIssues.has(i.id));
  const generalistSeats = Math.min(generalistAgents.length, unmatchedIssues.length);

  return Math.min(cap, specialistSeats + generalistSeats);
}
