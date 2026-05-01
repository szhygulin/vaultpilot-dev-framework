import { promises as fs } from "node:fs";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { agentClaudeMdPath } from "./specialization.js";
import type { AgentRecord } from "../types.js";

// Thresholds for "this agent is overloaded enough to warrant splitting".
// Crossing ANY of the three is enough — they capture distinct overload
// shapes: many issues (volume), wide tag scatter (breadth), large memory
// file (rule sprawl).
export const SPLIT_THRESHOLD_ISSUES = 20;
export const SPLIT_THRESHOLD_TAGS = 50;
export const SPLIT_THRESHOLD_BYTES = 30 * 1024;

const PROPOSAL_MODEL = "claude-sonnet-4-6";
const MAX_CLUSTERS = 3;

export interface OverloadVerdict {
  agentId: string;
  reasons: string[];
  claudeMdBytes: number;
}

export function detectOverload(
  agent: AgentRecord,
  claudeMdBytes: number,
): OverloadVerdict | null {
  const reasons: string[] = [];
  if (agent.issuesHandled >= SPLIT_THRESHOLD_ISSUES) {
    reasons.push(`issuesHandled=${agent.issuesHandled} >= ${SPLIT_THRESHOLD_ISSUES}`);
  }
  if (agent.tags.length >= SPLIT_THRESHOLD_TAGS) {
    reasons.push(`tags=${agent.tags.length} >= ${SPLIT_THRESHOLD_TAGS}`);
  }
  if (claudeMdBytes >= SPLIT_THRESHOLD_BYTES) {
    reasons.push(
      `CLAUDE.md=${(claudeMdBytes / 1024).toFixed(1)}KB >= ${SPLIT_THRESHOLD_BYTES / 1024}KB`,
    );
  }
  if (reasons.length === 0) return null;
  return { agentId: agent.agentId, reasons, claudeMdBytes };
}

export interface ParsedSection {
  // Identifier used by clusterer to refer to this section in proposed
  // partitions. Position-based, stable across calls on the same MD file.
  sectionId: string;
  runId?: string;
  issueId?: number;
  outcome?: string;
  heading: string;
  body: string;
}

// The summarizer in src/agent/specialization.ts (appendBlock) prepends every
// appended section with `<!-- run:R issue:#N outcome:O ts:T -->` followed
// by `## heading` and the body. This regex isolates that exact shape across
// the file — sections in the seed (target repo's CLAUDE.md) lack the
// provenance comment, so they never match here. That's the right behavior:
// only summarizer-appended lessons are attributable to a specific issue.
const SECTION_RE =
  /<!--\s*run:(\S+)\s+issue:#(\d+)\s+outcome:(\S+)\s+ts:[^-]+-->\s*\n##\s+(.+?)\n([\s\S]*?)(?=\n<!--\s*run:|\n## (?!.*?<!-- run)|$)/g;

export function parseClaudeMdSections(md: string): ParsedSection[] {
  const out: ParsedSection[] = [];
  let i = 0;
  for (const m of md.matchAll(SECTION_RE)) {
    out.push({
      sectionId: `s${i++}`,
      runId: m[1],
      issueId: Number(m[2]),
      outcome: m[3],
      heading: m[4].trim(),
      body: m[5].trim(),
    });
  }
  return out;
}

export interface ProposedCluster {
  proposedName: string;
  proposedTags: string[];
  sectionIds: string[];
  rationale: string;
}

export interface SplitProposal {
  agentId: string;
  parentTags: string[];
  clusters: ProposedCluster[];
  unclusteredSectionIds: string[];
  inputBytes: number;
  sectionCount: number;
  notes?: string;
}

const ProposalSchema = z.object({
  clusters: z
    .array(
      z.object({
        proposedName: z.string().min(1).max(40),
        proposedTags: z.array(z.string().min(1)).min(1).max(20),
        sectionIds: z.array(z.string().min(1)).min(1),
        rationale: z.string().min(1).max(400),
      }),
    )
    .min(2)
    .max(MAX_CLUSTERS),
  unclusteredSectionIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export interface ProposeSplitInput {
  agent: AgentRecord;
  /** The agent's current CLAUDE.md (or seed if missing). */
  claudeMd: string;
}

export async function proposeSplit(
  input: ProposeSplitInput,
): Promise<SplitProposal> {
  const sections = parseClaudeMdSections(input.claudeMd);
  if (sections.length < 4) {
    // With <4 attributable sections there's not enough signal to split on
    // — return a single-cluster "no-op" proposal callers can render as
    // "not enough history yet to split meaningfully".
    return {
      agentId: input.agent.agentId,
      parentTags: input.agent.tags,
      clusters: [],
      unclusteredSectionIds: sections.map((s) => s.sectionId),
      inputBytes: Buffer.byteLength(input.claudeMd, "utf-8"),
      sectionCount: sections.length,
      notes: "Too few attributable sections (<4) to cluster meaningfully.",
    };
  }

  const userPrompt = buildClusterPrompt({ agent: input.agent, sections });
  let raw = "";
  const stream = query({
    prompt: userPrompt,
    options: {
      model: PROPOSAL_MODEL,
      systemPrompt: SPLIT_SYSTEM_PROMPT,
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
      else throw new Error(`split clusterer failed: ${msg.subtype}`);
    }
  }

  const json = parseJsonLoose(raw);
  if (!json) throw new Error(`split clusterer output not valid JSON: ${raw.slice(0, 200)}`);
  const parsed = ProposalSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `split clusterer schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 400)}`,
    );
  }

  const validIds = new Set(sections.map((s) => s.sectionId));
  for (const c of parsed.data.clusters) {
    for (const id of c.sectionIds) {
      if (!validIds.has(id)) {
        throw new Error(`cluster references unknown sectionId ${id}`);
      }
    }
  }

  return {
    agentId: input.agent.agentId,
    parentTags: input.agent.tags,
    clusters: parsed.data.clusters,
    unclusteredSectionIds: parsed.data.unclusteredSectionIds,
    inputBytes: Buffer.byteLength(input.claudeMd, "utf-8"),
    sectionCount: sections.length,
    notes: parsed.data.notes,
  };
}

const SPLIT_SYSTEM_PROMPT = `You cluster a coding agent's accumulated lessons into distinct sub-specializations so the agent can be split into multiple specialists.

Input: a list of CLAUDE.md sections, each tagged with a sectionId, the issue it came from, the outcome, and the section heading + body. The agent has accumulated too many lessons across too many topics — your job is to find 2-3 clusters that represent coherent sub-specialties.

Output rules:
- Emit 2 or 3 clusters. Less than 2 is not a split. More than 3 fragments the agent.
- Each cluster needs:
  - proposedName: a short topical name fitting computing/math/engineering history (e.g. "Solana", "Safe", "Oracle Forensics"). Capitalize meaningfully.
  - proposedTags: the subset of the parent's tags that belong to this cluster (1-20 tags). Aim for tags that are actually distinctive to this cluster, not shared across all clusters.
  - sectionIds: the section IDs that belong to this cluster.
  - rationale: 1-3 sentences on why these sections form a coherent specialty.
- unclusteredSectionIds: sections that don't fit any cluster cleanly. Better to leave them out than force them in.
- notes: optional, 1-2 sentences about clustering quality or caveats.
- JSON only, no fences, no prose.`;

function buildClusterPrompt(opts: {
  agent: AgentRecord;
  sections: ParsedSection[];
}): string {
  const sectionLines = opts.sections.map((s) => {
    const head = `[${s.sectionId}] issue=#${s.issueId ?? "?"} outcome=${s.outcome ?? "?"}`;
    return `${head}\n  heading: ${s.heading}\n  body: ${truncate(s.body, 600)}`;
  });

  return `Agent ${opts.agent.agentId} has accumulated ${opts.sections.length} sections across ${opts.agent.tags.length} tags. Cluster them into 2-3 sub-specialties.

Parent tags (${opts.agent.tags.length}):
${JSON.stringify(opts.agent.tags)}

Sections:
${sectionLines.join("\n\n")}

Output JSON: {"clusters": [{"proposedName": "...", "proposedTags": ["..."], "sectionIds": ["s0", "s3", ...], "rationale": "..."}, ...], "unclusteredSectionIds": ["..."], "notes": "..." }`;
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
    const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
    if (fence) {
      try {
        return JSON.parse(fence[1]);
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

export async function readAgentClaudeMdBytes(agentId: string): Promise<{ md: string; bytes: number }> {
  const path = agentClaudeMdPath(agentId);
  try {
    const md = await fs.readFile(path, "utf-8");
    return { md, bytes: Buffer.byteLength(md, "utf-8") };
  } catch {
    return { md: "", bytes: 0 };
  }
}

export function formatProposal(p: SplitProposal): string {
  const lines: string[] = [];
  lines.push(`Split proposal for ${p.agentId}`);
  lines.push("=".repeat(`Split proposal for ${p.agentId}`.length));
  lines.push(`  CLAUDE.md size:     ${(p.inputBytes / 1024).toFixed(1)}KB`);
  lines.push(`  Sections analyzed:  ${p.sectionCount}`);
  lines.push(`  Parent tags:        ${p.parentTags.length}`);
  lines.push("");
  if (p.clusters.length === 0) {
    lines.push("  (no clusters proposed)");
    if (p.notes) lines.push(`  ${p.notes}`);
    return lines.join("\n");
  }
  for (const c of p.clusters) {
    lines.push(`  -> ${c.proposedName}  (${c.sectionIds.length} sections, ${c.proposedTags.length} tags)`);
    lines.push(`     tags: ${c.proposedTags.join(", ")}`);
    lines.push(`     why:  ${c.rationale}`);
    lines.push("");
  }
  if (p.unclusteredSectionIds.length > 0) {
    lines.push(`  Unclustered (${p.unclusteredSectionIds.length}): ${p.unclusteredSectionIds.join(", ")}`);
  }
  if (p.notes) lines.push(`  Notes: ${p.notes}`);
  lines.push("");
  lines.push("To apply this split (creates child agents, archives parent):");
  lines.push(`  vp-dev agents split ${p.agentId} --apply`);
  lines.push("(--apply not yet implemented; this PR ships read-only detection.)");
  return lines.join("\n");
}
