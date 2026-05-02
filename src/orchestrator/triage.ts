import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ensureDir } from "../state/locks.js";
import { getIssueDetail, type IssueComment, type IssueDetail } from "../github/gh.js";
import type { IssueSummary } from "../types.js";
import type { Logger } from "../log/logger.js";

const TRIAGE_MODEL = "claude-haiku-4-5-20251001";
const REASON_MAX = 240;

export const TRIAGE_DIR = path.resolve(process.cwd(), "state", "triage");

export const TriageResultSchema = z.object({
  ready: z.boolean(),
  reason: z.string().min(1).max(REASON_MAX),
  suggestedSpecialty: z.string().max(80).optional(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export interface TriagedIssue {
  issue: IssueSummary;
  result: TriageResult;
  fromCache: boolean;
  costUsd: number;
}

interface CacheEntry {
  targetRepo: string;
  issueNumber: number;
  contentHash: string;
  result: TriageResult;
  triagedAt: string;
}

export interface TriageBatchInput {
  targetRepo: string;
  issues: IssueSummary[];
  logger: Logger;
}

export async function triageBatch(input: TriageBatchInput): Promise<TriagedIssue[]> {
  // Sequential: keeps log output ordered and avoids hammering the gh CLI +
  // Anthropic API for ranges of 50+ issues. Triage is a short-lived
  // pre-flight; serial execution costs ~1-2s per issue and keeps the gate
  // text predictable.
  const out: TriagedIssue[] = [];
  for (const issue of input.issues) {
    const triaged = await triageOne({
      targetRepo: input.targetRepo,
      issue,
      logger: input.logger,
    });
    out.push(triaged);
  }
  return out;
}

interface TriageOneInput {
  targetRepo: string;
  issue: IssueSummary;
  logger: Logger;
}

async function triageOne(input: TriageOneInput): Promise<TriagedIssue> {
  const detail = await getIssueDetail(input.targetRepo, input.issue.id);
  if (!detail) {
    // Issue disappeared between range resolve and triage — fail-open.
    return {
      issue: input.issue,
      result: { ready: true, reason: "triage skipped: issue detail unavailable" },
      fromCache: false,
      costUsd: 0,
    };
  }

  const contentHash = computeContentHash(detail);
  const cached = await readCache(input.targetRepo, input.issue.id, contentHash);
  if (cached) {
    input.logger.info("triage.cache_hit", {
      issueId: input.issue.id,
      contentHash,
      ready: cached.ready,
    });
    return {
      issue: input.issue,
      result: cached,
      fromCache: true,
      costUsd: 0,
    };
  }

  const fresh = await callTriageModel(detail, input.logger);
  await writeCache(input.targetRepo, input.issue.id, contentHash, fresh.result);
  input.logger.info("triage.evaluated", {
    issueId: input.issue.id,
    contentHash,
    ready: fresh.result.ready,
    reason: fresh.result.reason,
    costUsd: fresh.costUsd,
  });
  return {
    issue: input.issue,
    result: fresh.result,
    fromCache: false,
    costUsd: fresh.costUsd,
  };
}

interface ModelOutcome {
  result: TriageResult;
  costUsd: number;
}

async function callTriageModel(detail: IssueDetail, logger: Logger): Promise<ModelOutcome> {
  const userPrompt = buildPrompt(detail);
  let raw = "";
  let costUsd = 0;
  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        model: TRIAGE_MODEL,
        systemPrompt: TRIAGE_SYSTEM_PROMPT,
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
        if (msg.subtype === "success") {
          raw = msg.result;
          costUsd = msg.total_cost_usd ?? 0;
        } else {
          // Fail-open: model failure should not block the run.
          logger.warn("triage.model_failed", {
            issueId: detail.id,
            subtype: msg.subtype,
          });
          return failOpen(`triage model failed: ${msg.subtype}`);
        }
      }
    }
  } catch (err) {
    logger.warn("triage.model_failed", {
      issueId: detail.id,
      err: (err as Error).message,
    });
    return failOpen(`triage exception: ${(err as Error).message}`);
  }

  const json = parseJsonLoose(raw);
  if (!json) {
    logger.warn("triage.malformed_payload", {
      issueId: detail.id,
      raw: raw.slice(0, 4000),
    });
    return failOpen("triage output not valid JSON");
  }
  const clamped = clampReason(json);
  const parsed = TriageResultSchema.safeParse(clamped);
  if (!parsed.success) {
    logger.warn("triage.malformed_payload", {
      issueId: detail.id,
      raw: raw.slice(0, 4000),
      zodError: parsed.error.message.replace(/\s+/g, " "),
    });
    return failOpen(`triage schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 160)}`);
  }
  return { result: parsed.data, costUsd };
}

function failOpen(reason: string): ModelOutcome {
  return {
    result: { ready: true, reason: `fail-open: ${reason}`.slice(0, REASON_MAX) },
    costUsd: 0,
  };
}

function clampReason(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const obj = json as Record<string, unknown>;
  if (typeof obj.reason === "string" && obj.reason.length > REASON_MAX) {
    return { ...obj, reason: obj.reason.slice(0, REASON_MAX - 3) + "..." };
  }
  return obj;
}

const TRIAGE_SYSTEM_PROMPT = `You are a triage agent. Given a single GitHub issue's body and comments, decide whether it is ready to be picked up by an autonomous coding agent.

Rubric:
- Ready: a concrete bug with a repro, or a feature with explicit acceptance criteria, or a clearly-scoped refactor.
- NOT ready — ambiguous: "we should think about", "explore", "investigate", "discuss", or no acceptance criteria.
- NOT ready — duplicate: the issue body or comments explicitly say it is a duplicate of another open issue.
- NOT ready — body/comments conflict: the comments redirect to a different scope than the body, and a coding agent reading body-only would do the wrong thing.

The "Issue Analysis" rule from the agent's CLAUDE.md REQUIRES reading comments — body and comments together form the spec. Prefer comments when they correct or override the body.

Output: a single JSON object, no fences, no prose.
  {"ready": boolean, "reason": "<one short sentence, ≤240 chars>", "suggestedSpecialty"?: "<short hint, optional>"}

Hard rules:
- Default to ready: true when uncertain (the approval gate is the human backstop).
- The "reason" must explain WHY in one short sentence. For ready: cite the concrete signal ("explicit acceptance criteria", "bug with repro"). For not-ready: cite the disqualifier ("ambiguous scope", "duplicate of #N", "body/comments conflict").
- No markdown in the reason. No newlines inside the reason — write a single sentence.
- If the body is empty AND there are no comments, return ready: true with reason "empty body — fail open".`;

function buildPrompt(detail: IssueDetail): string {
  const commentBlocks = detail.comments
    .map((c) => `--- comment by ${c.author} at ${c.createdAt}\n${c.body}`)
    .join("\n\n");
  return `Issue ${detail.id} — ${detail.title}
Labels: ${JSON.stringify(detail.labels)}

Body:
${truncate(detail.body || "(empty)", 6000)}

Comments (${detail.comments.length}):
${truncate(commentBlocks || "(none)", 6000)}

Decide ready/not-ready per the rubric. JSON only.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function computeContentHash(detail: IssueDetail): string {
  const h = createHash("sha256");
  h.update(detail.body ?? "");
  h.update("\n--comments--\n");
  for (const c of detail.comments) {
    h.update(commentKey(c));
    h.update("\n");
  }
  return "sha256:" + h.digest("hex").slice(0, 32);
}

function commentKey(c: IssueComment): string {
  // createdAt + author + body — author/timestamp shifts mean a different
  // comment even if body is identical (rare but real for "+1" threads).
  return `${c.createdAt}|${c.author}|${c.body}`;
}

function repoCacheDir(targetRepo: string): string {
  // owner/repo -> owner__repo so it's a single safe path segment.
  return path.join(TRIAGE_DIR, targetRepo.replace("/", "__"));
}

function cacheFilePath(targetRepo: string, issueNumber: number): string {
  return path.join(repoCacheDir(targetRepo), `${issueNumber}.json`);
}

async function readCache(
  targetRepo: string,
  issueNumber: number,
  contentHash: string,
): Promise<TriageResult | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(targetRepo, issueNumber), "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.contentHash !== contentHash) return null;
    const parsed = TriageResultSchema.safeParse(entry.result);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeCache(
  targetRepo: string,
  issueNumber: number,
  contentHash: string,
  result: TriageResult,
): Promise<void> {
  const entry: CacheEntry = {
    targetRepo,
    issueNumber,
    contentHash,
    result,
    triagedAt: new Date().toISOString(),
  };
  const filePath = cacheFilePath(targetRepo, issueNumber);
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(entry, null, 2));
  await fs.rename(tmp, filePath);
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
