import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildTickPrompt } from "./prompt.js";
import { TickProposalSchema, type TickAssignment } from "../types.js";
import { deterministicFallback } from "./routing.js";
import type { AgentRecord, IssueSummary } from "../types.js";
import type { Logger } from "../log/logger.js";

export interface DispatchInput {
  idleAgents: AgentRecord[];
  pendingIssues: IssueSummary[];
  cap: number;
  logger: Logger;
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
}): Promise<ProposeOutcome> {
  const prompt = buildTickPrompt({
    pendingIssues: opts.pendingIssues,
    idleAgents: opts.idleAgents,
    cap: opts.cap,
    errorsFromPrior: opts.errorsFromPrior,
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
      },
    });
    for await (const msg of stream) {
      if (msg.type === "result") {
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

  const parsedJson = parseJsonLoose(raw);
  if (!parsedJson) return { errors: ["Orchestrator response is not valid JSON."] };

  const proposal = TickProposalSchema.safeParse(parsedJson);
  if (!proposal.success) return { errors: [`Schema invalid: ${proposal.error.message}`] };

  const errors = validateProposal({
    proposal: proposal.data.assignments,
    cap: opts.cap,
    idleAgents: opts.idleAgents,
    pendingIssues: opts.pendingIssues,
  });
  if (errors.length > 0) return { errors };
  return { assignments: proposal.data.assignments };
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // try fenced extraction
    const match = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface ValidateInput {
  proposal: TickAssignment[];
  cap: number;
  idleAgents: AgentRecord[];
  pendingIssues: IssueSummary[];
}

function validateProposal(input: ValidateInput): string[] {
  const errors: string[] = [];
  const idleSet = new Set(input.idleAgents.map((a) => a.agentId));
  const pendingSet = new Set(input.pendingIssues.map((i) => i.id));

  if (input.proposal.length > input.cap) {
    errors.push(`Too many assignments: ${input.proposal.length} > cap ${input.cap}`);
  }
  // Under-dispatch wastes parallelism: when cap > 0 the dispatcher must fill
  // every available slot. Past incident 2026-05-01: dispatcher returned 1
  // assignment at tick 2 with cap=2 (both agents idle, both issues pending),
  // costing a 10-min wall-clock gap before the next tick re-tried. Treating
  // under-dispatch as a validation error triggers the retry → deterministic
  // fallback path which always fills cap.
  if (input.cap > 0 && input.proposal.length < input.cap) {
    errors.push(
      `Under-dispatch: ${input.proposal.length} assignments < cap ${input.cap}. Fill every available slot — the cap reflects what's actually dispatchable.`,
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
