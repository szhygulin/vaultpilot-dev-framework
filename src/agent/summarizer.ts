import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import type { AgentRecord, IssueSummary, ResultEnvelope } from "../types.js";
import type { Logger } from "../log/logger.js";

const SUMMARIZER_MODEL = "claude-sonnet-4-6";

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
});
export type SummarizerOutput = z.infer<typeof SummarizerOutputSchema>;

export interface SummarizerInput {
  agent: AgentRecord;
  issue: IssueSummary;
  envelope: ResultEnvelope;
  toolUseTrace: { tool: string; input: string }[];
  finalText: string;
  logger: Logger;
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

Hard rules:
- If there is no GENERALIZABLE lesson — only a one-off fix, a routine implementation, a trivial pushback — return {"skip": true, "skipReason": "<one short sentence>"}. Empty learnings beat noisy ones.
- If the agent failed (decision="error"), default to skip unless there's a clear lesson about the failure mode itself.
- Heading: ≤ 120 chars, no trailing colon, no markdown prefix (no leading "##"). The append step prepends "##".
- Body: ≤ 2000 chars. 2–8 short lines. No prose paragraphs.
- Do NOT mention the specific issue number, PR number, or run id — that's in the provenance comment. Talk about the class of situation, not this instance.
- Inside heading / body / skipReason string values: escape every double-quote as \\" and every literal newline as \\n. Do NOT escape apostrophes — \\' is INVALID JSON (the parser only knows \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, \\uXXXX). Write apostrophes as a plain ': don't, isn't, can't. Prefer single-quote ' or backticks for emphasis when the alternative is acceptable.

Cross-agent promotion (OPTIONAL):
- If the lesson would also help a sibling agent in the same primary domain — typically a domain quirk, an SDK gotcha, an on-chain protocol invariant, or a tooling pitfall — wrap the body content in \`<!-- promote-candidate:<DOMAIN> --> ... <!-- /promote-candidate -->\` where DOMAIN is the agent's first non-"general" tag, lowercased.
- The wrapped section MUST be a descriptive observation, not an imperative directive ("on chain X, RPC Y returns null when …" — yes; "always do Z before calling Y" — no, that's per-agent rule shape).
- Fence or quote technical content (commands, addresses, code snippets).
- Skip the wrapping for behaviour rules specific to THIS agent's role, push-back patterns, workflow discipline, or anything that wouldn't survive being read by a sibling with a different tag set.
- A human reviewer gates promotion via \`vp-dev lessons review\` — false positives are recoverable, false negatives lose the cross-agent signal.

Output: a single JSON object, no fences, no prose. The \`skip\` field is MANDATORY in every response. Use \`{"skip": false, "heading": "...", "body": "..."}\` when there is a lesson worth saving, and \`{"skip": true, "skipReason": "..."}\` otherwise. Schema:
  {"skip": boolean, "skipReason"?: string, "heading"?: string, "body"?: string}`;

const FAILURE_SUMMARIZER_SYSTEM_PROMPT = `You are a distillation agent. A coding agent JUST FAILED on a single GitHub issue — CI red after retry, agent gave up, envelope decision="error", or the SDK crashed mid-run after producing partial work. Your job is to extract the highest-signal failure lesson worth committing to the agent's CLAUDE.md.

Failure-mode bias: lean toward EMITTING a lesson, not skipping. The whole point of this path is that today these signals are discarded — assume there is something worth saying unless the failure is genuinely opaque.

Three questions to anchor the body:
1. What did the agent ASSUME that turned out wrong?
2. What CONTEXT or TOOLING was missing — what would have unblocked it?
3. What GUARD RULE, written tersely, would have prevented this on the next similar issue?

Style: match the dense rule-form of an existing CLAUDE.md section. Lead with the rule itself in bold. Then a **Why:** line (the failure mode this targets). Then a **How to apply:** line (when this guidance kicks in). Use **Tells:** sparingly. Markdown hyperlinks (\`[label](url)\`) over raw URLs.

Hard rules:
- If the failure was genuinely uninformative (single ambiguous error string, no agent reasoning, no clear missed assumption), emit \`{"skip": true, "skipReason": "<one short sentence>"}\`. Wrong-lesson risk beats noisy-lesson risk.
- Heading: ≤ 120 chars, no trailing colon, no markdown prefix (no leading "##"). The append step prepends "##".
- Body: ≤ 2000 chars. 2–8 short lines. No prose paragraphs.
- Do NOT mention the specific issue number, PR number, or run id — that's in the provenance comment. Talk about the class of failure, not this instance.
- Inside heading / body / skipReason string values: escape every double-quote as \\" and every literal newline as \\n. Do NOT escape apostrophes — \\' is INVALID JSON. Write apostrophes as a plain ': don't, isn't, can't.

Cross-agent promotion (OPTIONAL):
- If the failure mode would also bite a sibling agent in the same primary domain (SDK quirk, RPC behaviour, protocol invariant, build / test pitfall), wrap the relevant body content in \`<!-- promote-candidate:<DOMAIN> --> ... <!-- /promote-candidate -->\` where DOMAIN is the agent's first non-"general" tag, lowercased.
- Wrapped content MUST be a descriptive observation, not an imperative directive. Fence technical content (commands, addresses, code).
- Skip the wrapping for failures specific to this agent's workflow, push-back style, or one-off plan-vs-code mismatch — those don't generalize across siblings.
- Human reviewer gates promotion via \`vp-dev lessons review\`.

Output: a single JSON object, no fences, no prose. The \`skip\` field is MANDATORY in every response. Schema:
  {"skip": boolean, "skipReason"?: string, "heading"?: string, "body"?: string}`;

function buildFailurePrompt(input: FailureSummarizerInput): string {
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

Decide: is there a generalizable failure lesson worth committing to this agent's CLAUDE.md? Lean toward yes — failure-mode runs exist to capture signal that success-mode discards. If yes, emit {"skip": false, "heading": "...", "body": "..."}. If the failure is genuinely opaque, emit {"skip": true, "skipReason": "..."}. The skip field is mandatory in both shapes. JSON only — escape every \\" inside string values.`;
}

function buildPrompt(input: SummarizerInput): string {
  const trace = input.toolUseTrace
    .slice(-12)
    .map((t) => `- ${t.tool}: ${t.input}`)
    .join("\n");

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

Decide: is there a generalizable rule worth committing to this agent's CLAUDE.md? If yes, emit {"skip": false, "heading": "...", "body": "..."}. If no, emit {"skip": true, "skipReason": "..."}. The skip field is mandatory in both shapes. JSON only — escape every \\" inside string values.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

