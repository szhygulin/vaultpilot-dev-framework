// Phase A (issue #158) — advisory-only compaction-via-merge for an agent's
// CLAUDE.md when growth is in section *depth* rather than section *count*.
//
// The splitter (src/agent/split.ts) addresses a different overload shape:
// an agent has accumulated multiple distinct sub-specialties that should
// be partitioned into sibling agents. When growth is concentrated in
// few-but-large coherent sections, splitting fragments the same specialty
// across siblings; the right tool is to merge near-duplicate lessons in
// place, preserving the specialty.
//
// This module is purely advisory: it parses sections, asks an opus model
// to propose merge clusters, validates the proposal (Zod schema + a
// collapsed-distinct-rules guard), and emits a dry-run report. No file
// mutation. The destructive `--apply` path is deferred to issue #162.
//
// Usage: `vp-dev agents compact-claude-md <agentId> [--json] [--min-cluster-size N]`.

import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { parseClaudeMdSections, type ParsedSection } from "./split.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_SPLIT } from "../orchestrator/models.js";
import type { AgentRecord } from "../types.js";

// Shares the splitter's tier (opus) — the prompts are similar shape (full
// CLAUDE.md → structured proposal), and merge-quality matters more than
// per-call cost. Env override flows through `models.ts`.
const COMPACT_MODEL = ORCHESTRATOR_MODEL_SPLIT;

// Minimum merged-cluster size below which the model is told to leave
// sections alone. Default 3 (per issue #158: 2 is too aggressive, any
// near-duplicate gets merged and loses nuance). Operator-tunable from CLI.
export const DEFAULT_MIN_CLUSTER_SIZE = 3;

// Per-field caps on the LLM proposal payload. `proposedBody` can legitimately
// be larger than per-section bodies (it's a synthesis), but a generous
// ceiling prevents the model from emitting essay-length merges that defeat
// the purpose of compaction.
const HEADING_MAX = 100;
const BODY_MAX = 6000;
const RATIONALE_MAX = 800;

export interface CompactionCluster {
  /** ≥2 sectionIds from parseClaudeMdSections, all to be merged into one. */
  sectionIds: string[];
  /** Heading proposed for the merged section (replaces all source headings). */
  proposedHeading: string;
  /** Synthesized body covering every load-bearing detail from source bodies. */
  proposedBody: string;
  /** 1-3 sentences on why these sections share a thesis. */
  rationale: string;
  /** Provenance preserved from source sections — surfaces which past
   *  runs/issues contributed lessons to the merge. */
  sourceProvenance: Array<{ runId: string; issueId: number }>;
}

export interface CompactionProposal {
  agentId: string;
  clusters: CompactionCluster[];
  /** sectionIds the model declined to cluster. Better to leave nuanced
   *  one-offs alone than to force them into a weak cluster. */
  unclusteredSectionIds: string[];
  /** Sum of (source-bytes - merged-bytes) across all clusters; advisory. */
  estimatedBytesSaved: number;
  inputBytes: number;
  sectionCount: number;
  /** Optional model-side note on proposal quality / caveats. */
  notes?: string;
  /** Per-cluster validator findings (e.g., dropped-date warnings). Empty
   *  array on a clean proposal. Phase A surfaces them as advisories; the
   *  destructive --apply path (#162) will treat them as hard rejections. */
  warnings: CompactionWarning[];
}

export type CompactionWarning = {
  kind: "dropped-incident-date";
  clusterIndex: number;
  /** Dates present in source section bodies but missing from the merged body. */
  missingDates: string[];
  /** sectionIds of the source sections whose dates were dropped. */
  fromSectionIds: string[];
};

const ClusterSchema = z.object({
  sectionIds: z.array(z.string().min(1)).min(2),
  proposedHeading: z.string().min(1).max(HEADING_MAX),
  proposedBody: z.string().min(1).max(BODY_MAX),
  rationale: z.string().min(1).max(RATIONALE_MAX),
});

const ProposalPayloadSchema = z.object({
  clusters: z.array(ClusterSchema).default([]),
  unclusteredSectionIds: z.array(z.string()).default([]),
  notes: z.string().max(500).optional(),
});

function clampClusterFields(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const obj = json as Record<string, unknown>;
  const clusters = obj.clusters;
  if (!Array.isArray(clusters)) return obj;
  const next = clusters.map((c) => {
    if (!c || typeof c !== "object") return c;
    const cluster = c as Record<string, unknown>;
    const out: Record<string, unknown> = { ...cluster };
    if (typeof cluster.proposedHeading === "string" && cluster.proposedHeading.length > HEADING_MAX) {
      out.proposedHeading = cluster.proposedHeading.slice(0, HEADING_MAX - 3) + "...";
    }
    if (typeof cluster.proposedBody === "string" && cluster.proposedBody.length > BODY_MAX) {
      out.proposedBody = cluster.proposedBody.slice(0, BODY_MAX - 16) + "\n[…truncated]";
    }
    if (typeof cluster.rationale === "string" && cluster.rationale.length > RATIONALE_MAX) {
      out.rationale = cluster.rationale.slice(0, RATIONALE_MAX - 16) + "\n[…truncated]";
    }
    return out;
  });
  return { ...obj, clusters: next };
}

// ISO-style date matcher: catches `2026-05-05`, `2026-04-28`, etc. Used by
// the collapsed-distinct-rules validator. Deliberately strict on shape so
// it doesn't false-positive on version numbers or arbitrary digit triples
// that show up in code samples (`12.34.567`).
const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/g;

export function extractDistinctDates(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(DATE_RE)) out.add(m[1]);
  return out;
}

/**
 * Collapsed-distinct-rules validator (per issue #158).
 *
 * Checks every cluster: are all distinct ISO dates present in the source
 * bodies also present in the merged body? If a date appears in any source
 * but not in the merge, the model has dropped a load-bearing past-incident
 * citation — flag the cluster as unsafe to apply.
 *
 * Cheap textual heuristic. Misses incidents cited by phrase-only ("the
 * SunSwap rebase incident") rather than date, but those are the rarer
 * shape; date-cited incidents dominate this codebase's lessons.
 */
export function findDroppedIncidentDates(
  proposal: { clusters: CompactionCluster[] },
  sections: ParsedSection[],
): CompactionWarning[] {
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
  const warnings: CompactionWarning[] = [];
  proposal.clusters.forEach((cluster, idx) => {
    const sourceDates = new Set<string>();
    const datesByOrigin = new Map<string, string[]>(); // date -> sectionIds
    for (const sid of cluster.sectionIds) {
      const sec = sectionById.get(sid);
      if (!sec) continue;
      for (const d of extractDistinctDates(sec.body)) {
        sourceDates.add(d);
        const arr = datesByOrigin.get(d) ?? [];
        if (!arr.includes(sid)) arr.push(sid);
        datesByOrigin.set(d, arr);
      }
    }
    const mergedDates = extractDistinctDates(cluster.proposedBody);
    const missing: string[] = [];
    const fromIds = new Set<string>();
    for (const d of sourceDates) {
      if (!mergedDates.has(d)) {
        missing.push(d);
        for (const sid of datesByOrigin.get(d) ?? []) fromIds.add(sid);
      }
    }
    if (missing.length > 0) {
      missing.sort();
      warnings.push({
        kind: "dropped-incident-date",
        clusterIndex: idx,
        missingDates: missing,
        fromSectionIds: Array.from(fromIds).sort(),
      });
    }
  });
  return warnings;
}

export interface ProposeCompactionInput {
  agent: AgentRecord;
  /** Current CLAUDE.md content for the agent. */
  claudeMd: string;
  /** Minimum cluster size the model is asked to honour. Default 3. */
  minClusterSize?: number;
}

export async function proposeCompaction(
  input: ProposeCompactionInput,
): Promise<CompactionProposal> {
  const minClusterSize = input.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;
  const sections = parseClaudeMdSections(input.claudeMd);
  const inputBytes = Buffer.byteLength(input.claudeMd, "utf-8");
  const baseProposal: Omit<CompactionProposal, "clusters" | "unclusteredSectionIds" | "estimatedBytesSaved" | "warnings" | "notes"> = {
    agentId: input.agent.agentId,
    inputBytes,
    sectionCount: sections.length,
  };

  // Compaction needs at least minClusterSize attributable sections to
  // produce a meaningful merge. Below that threshold, return a no-op
  // proposal — same shape as the splitter's <4-section degenerate case.
  if (sections.length < minClusterSize) {
    return {
      ...baseProposal,
      clusters: [],
      unclusteredSectionIds: sections.map((s) => s.sectionId),
      estimatedBytesSaved: 0,
      warnings: [],
      notes: `Too few attributable sections (${sections.length}) to compact at min-cluster-size=${minClusterSize}.`,
    };
  }

  const userPrompt = buildCompactionPrompt({
    agent: input.agent,
    sections,
    minClusterSize,
  });
  let raw = "";
  const stream = query({
    prompt: userPrompt,
    options: {
      model: COMPACT_MODEL,
      systemPrompt: buildCompactionSystemPrompt(minClusterSize),
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
      else throw new Error(`compactClaudeMd model failed: ${msg.subtype}`);
    }
  }

  const extracted = parseJsonEnvelope(raw, z.unknown());
  if (!extracted.ok) {
    throw new Error(
      `compactClaudeMd output not valid JSON: ${extracted.error ?? "no envelope"}`,
    );
  }
  const clamped = clampClusterFields(extracted.value);
  const parsed = ProposalPayloadSchema.safeParse(clamped);
  if (!parsed.success) {
    throw new Error(
      `compactClaudeMd schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 400)}`,
    );
  }

  const validIds = new Set(sections.map((s) => s.sectionId));
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
  const seenIds = new Set<string>();
  const clusters: CompactionCluster[] = [];
  for (const c of parsed.data.clusters) {
    // Drop clusters below the floor; still surface in unclustered list.
    if (c.sectionIds.length < minClusterSize) continue;
    for (const id of c.sectionIds) {
      if (!validIds.has(id)) {
        throw new Error(`compactClaudeMd cluster references unknown sectionId ${id}`);
      }
      if (seenIds.has(id)) {
        throw new Error(
          `compactClaudeMd cluster reuses sectionId ${id}; sections may belong to at most one cluster`,
        );
      }
      seenIds.add(id);
    }
    const provenance: Array<{ runId: string; issueId: number }> = [];
    for (const sid of c.sectionIds) {
      const sec = sectionById.get(sid);
      if (!sec || !sec.runId || sec.issueId == null) continue;
      provenance.push({ runId: sec.runId, issueId: sec.issueId });
    }
    clusters.push({
      sectionIds: c.sectionIds,
      proposedHeading: c.proposedHeading,
      proposedBody: c.proposedBody,
      rationale: c.rationale,
      sourceProvenance: provenance,
    });
  }

  const unclusteredSectionIds = sections
    .map((s) => s.sectionId)
    .filter((id) => !seenIds.has(id));

  const estimatedBytesSaved = computeEstimatedBytesSaved(clusters, sectionById);
  const warnings = findDroppedIncidentDates({ clusters }, sections);

  return {
    ...baseProposal,
    clusters,
    unclusteredSectionIds,
    estimatedBytesSaved,
    warnings,
    notes: parsed.data.notes,
  };
}

function computeEstimatedBytesSaved(
  clusters: CompactionCluster[],
  sectionById: Map<string, ParsedSection>,
): number {
  let saved = 0;
  for (const c of clusters) {
    let sourceBytes = 0;
    for (const sid of c.sectionIds) {
      const sec = sectionById.get(sid);
      if (!sec) continue;
      // Approximate source size as heading + body + a fixed overhead for
      // the provenance comment line. Close enough for an advisory metric.
      sourceBytes +=
        Buffer.byteLength(sec.heading, "utf-8") +
        Buffer.byteLength(sec.body, "utf-8") +
        80;
    }
    const mergedBytes =
      Buffer.byteLength(c.proposedHeading, "utf-8") +
      Buffer.byteLength(c.proposedBody, "utf-8") +
      80;
    saved += Math.max(0, sourceBytes - mergedBytes);
  }
  return saved;
}

export function buildCompactionSystemPrompt(minClusterSize: number): string {
  return `You compact a coding agent's accumulated CLAUDE.md by merging near-duplicate lessons that share a single thesis.

Input: a list of CLAUDE.md sections, each tagged with a sectionId, the issue it came from, the outcome, and the section heading + body. The agent's growth is in section depth — many sections share the same underlying rule with only minor variation. Your job is to find clusters of ${minClusterSize}+ sections that can be losslessly merged.

CRITICAL: lossless means every load-bearing detail from every source section MUST appear in the merged body. In particular:
- Every "Past incident YYYY-MM-DD" citation MUST be preserved (an automated validator checks this; missing dates flag the cluster as unsafe).
- Every distinct mechanism, threshold, or numeric tunable MUST be preserved.
- Every cross-reference (issue #N, PR #N, repo name) MUST be preserved.
- "Tells" lists and "How to apply" steps from each source MUST be unioned, not picked.

Output rules:
- Each cluster must merge ${minClusterSize}+ sectionIds.
- Each cluster needs:
  - sectionIds: the section IDs being merged (≥${minClusterSize}).
  - proposedHeading: a short canonical heading (<= 100 chars). Capture the shared thesis.
  - proposedBody: synthesized body containing every load-bearing detail from the sources. Bullets > prose. Cite every past-incident date verbatim.
  - rationale: 1-3 sentences on why these sections share a thesis.
- unclusteredSectionIds: sections that don't share a thesis with ${minClusterSize - 1}+ others. Better to leave them than force a weak cluster.
- notes: optional 1-2 sentences on caveats.
- A section may belong to AT MOST one cluster.

Output: a single JSON object, no fences, no prose:
  {"clusters": [{"sectionIds": ["s0","s3","s7"], "proposedHeading": "...", "proposedBody": "...", "rationale": "..."}], "unclusteredSectionIds": ["s1","s2"], "notes": "..."}

Returning {"clusters": [], "unclusteredSectionIds": ["s0","s1",...]} is acceptable when no clean merge exists.`;
}

export function buildCompactionPrompt(opts: {
  agent: AgentRecord;
  sections: ParsedSection[];
  minClusterSize: number;
}): string {
  const sectionLines = opts.sections.map((s) => {
    const head = `[${s.sectionId}] issue=#${s.issueId ?? "?"} outcome=${s.outcome ?? "?"} run=${s.runId ?? "?"}`;
    return `${head}\n  heading: ${s.heading}\n  body:\n${indent(s.body, "    ")}`;
  });

  return `Agent ${opts.agent.agentId} has accumulated ${opts.sections.length} attributable sections across ${opts.agent.tags.length} tags. Identify clusters of ${opts.minClusterSize}+ sections that share a single thesis and can be merged losslessly.

Parent tags (${opts.agent.tags.length}):
${JSON.stringify(opts.agent.tags)}

Sections:
${sectionLines.join("\n\n")}

Emit the JSON object now. min-cluster-size is ${opts.minClusterSize}.`;
}

function indent(s: string, prefix: string): string {
  return s.split("\n").map((line) => prefix + line).join("\n");
}

export function formatCompactionProposal(p: CompactionProposal): string {
  const lines: string[] = [];
  const heading = `Compaction proposal for ${p.agentId}`;
  lines.push(heading);
  lines.push("=".repeat(heading.length));
  lines.push(`  CLAUDE.md size:     ${(p.inputBytes / 1024).toFixed(1)}KB`);
  lines.push(`  Sections analyzed:  ${p.sectionCount}`);
  lines.push(`  Clusters proposed:  ${p.clusters.length}`);
  lines.push(
    `  Estimated savings:  ${(p.estimatedBytesSaved / 1024).toFixed(1)}KB`,
  );
  lines.push("");
  if (p.clusters.length === 0) {
    lines.push("  (no merge clusters proposed)");
    if (p.notes) lines.push(`  ${p.notes}`);
    return lines.join("\n");
  }

  p.clusters.forEach((c, idx) => {
    lines.push(`  -> [${idx}] ${c.proposedHeading}  (merging ${c.sectionIds.length} sections)`);
    lines.push(`     sections: ${c.sectionIds.join(", ")}`);
    lines.push(`     why:      ${c.rationale}`);
    if (c.sourceProvenance.length > 0) {
      const prov = c.sourceProvenance
        .map((p) => `#${p.issueId}`)
        .join(", ");
      lines.push(`     provenance: ${prov}`);
    }
    const myWarnings = p.warnings.filter((w) => w.clusterIndex === idx);
    for (const w of myWarnings) {
      if (w.kind === "dropped-incident-date") {
        lines.push(
          `     ⚠ DROPPED DATES: ${w.missingDates.join(", ")} (from ${w.fromSectionIds.join(", ")})`,
        );
      }
    }
    lines.push("");
  });

  if (p.unclusteredSectionIds.length > 0) {
    lines.push(`  Unclustered (${p.unclusteredSectionIds.length}): ${p.unclusteredSectionIds.join(", ")}`);
  }
  if (p.notes) lines.push(`  Notes: ${p.notes}`);
  lines.push("");
  if (p.warnings.length > 0) {
    lines.push(
      `⚠ ${p.warnings.length} cluster(s) flagged by the collapsed-distinct-rules validator — review carefully before any --apply path.`,
    );
  } else {
    lines.push(
      "No validator warnings. (Phase A is advisory only; --apply is tracked at #162.)",
    );
  }
  return lines.join("\n");
}
