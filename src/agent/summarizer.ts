import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRecord, IssueSummary, ResultEnvelope } from "../types.js";
import type { Logger } from "../log/logger.js";

const SUMMARIZER_MODEL = "claude-sonnet-4-6";

export const SummarizerOutputSchema = z.object({
  skip: z.boolean(),
  skipReason: z.string().optional(),
  heading: z.string().min(3).max(120).optional(),
  body: z.string().min(3).max(800).optional(),
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
  const userPrompt = buildPrompt(input);

  let raw = "";
  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        model: SUMMARIZER_MODEL,
        systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
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
        else {
          input.logger.warn("specialization.summarizer_failed", {
            agentId: input.agent.agentId,
            issueId: input.issue.id,
            subtype: msg.subtype,
          });
          return { skip: true, skipReason: `summarizer query failed: ${msg.subtype}` };
        }
      }
    }
  } catch (err) {
    input.logger.warn("specialization.summarizer_failed", {
      agentId: input.agent.agentId,
      issueId: input.issue.id,
      err: (err as Error).message,
    });
    return { skip: true, skipReason: `summarizer exception: ${(err as Error).message}` };
  }

  const json = parseJsonLoose(raw);
  if (!json) {
    return { skip: true, skipReason: "summarizer output not valid JSON" };
  }
  const parsed = SummarizerOutputSchema.safeParse(json);
  if (!parsed.success) {
    return { skip: true, skipReason: `summarizer schema invalid: ${parsed.error.message}` };
  }
  if (!parsed.data.skip && (!parsed.data.heading || !parsed.data.body)) {
    return { skip: true, skipReason: "missing heading or body" };
  }
  return parsed.data;
}

const SUMMARIZER_SYSTEM_PROMPT = `You are a distillation agent. After a coding agent has finished work on a single GitHub issue, your job is to extract any GENERALIZABLE rule that should bind the agent's behavior on FUTURE similar issues — and append it to the agent's evolving CLAUDE.md.

Style: match the dense rule-form of an existing CLAUDE.md section. Lead with the rule itself in bold. Then a **Why:** line (the reason — often a past incident, a hidden constraint, a strong preference). Then a **How to apply:** line (when this guidance kicks in). Use **Tells:** sparingly to list signals of the situation. Markdown hyperlinks (\`[label](url)\`) over raw URLs.

Hard rules:
- If there is no GENERALIZABLE lesson — only a one-off fix, a routine implementation, a trivial pushback — return {"skip": true, "skipReason": "<one short sentence>"}. Empty learnings beat noisy ones.
- If the agent failed (decision="error"), default to skip unless there's a clear lesson about the failure mode itself.
- Heading: ≤ 120 chars, no trailing colon, no markdown prefix (no leading "##"). The append step prepends "##".
- Body: ≤ 800 chars. 2–6 short lines. No prose paragraphs.
- Do NOT mention the specific issue number, PR number, or run id — that's in the provenance comment. Talk about the class of situation, not this instance.

Output: a single JSON object, no fences, no prose. Schema:
  {"skip": boolean, "skipReason"?: string, "heading"?: string, "body"?: string}`;

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

Decide: is there a generalizable rule worth committing to this agent's CLAUDE.md? If yes, emit {heading, body}. If no, emit {"skip": true, "skipReason": "..."}. JSON only.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
