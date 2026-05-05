// Phase A (issue #158) — advisory-only compaction-via-merge for an agent's
// CLAUDE.md when growth is in section *depth* rather than section *count*.
// Phase B (issue #162) — destructive `applyCompaction` rewrite under the
// same per-file lock used by `appendBlock` / `expireSentinels`, gated by a
// proposalHash drift check and the validator's hard rejection on dropped
// past-incident dates.
//
// The splitter (src/agent/split.ts) addresses a different overload shape:
// an agent has accumulated multiple distinct sub-specialties that should
// be partitioned into sibling agents. When growth is concentrated in
// few-but-large coherent sections, splitting fragments the same specialty
// across siblings; the right tool is to merge near-duplicate lessons in
// place, preserving the specialty.
//
// Usage:
//   vp-dev agents compact-claude-md <agentId> [--json] [--min-cluster-size N]
//   vp-dev agents compact-claude-md <agentId> --apply
//   vp-dev agents compact-claude-md <agentId> --confirm <token>

import { promises as fs } from "node:fs";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinPath } from "./sdkBinary.js";
import { parseClaudeMdSections, type ParsedSection } from "./split.js";
import { agentClaudeMdPath } from "./specialization.js";
import { withFileLock } from "../state/locks.js";
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
      `⚠ ${p.warnings.length} cluster(s) flagged by the collapsed-distinct-rules validator — --apply will reject this proposal until re-run produces a clean output.`,
    );
  } else {
    lines.push(
      "No validator warnings. Pass --apply to mint a confirm token; --confirm <token> to perform the rewrite.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Phase B (issue #162): destructive applyCompaction
// ---------------------------------------------------------------------------

export interface ApplyCompactionInput {
  agentId: string;
  /** Proposal recorded in the confirm token at plan time. */
  proposal: CompactionProposal;
  /** Hash recorded in the confirm token: sha256(JSON.stringify(proposal) + sha256(file@plan)). */
  expectedProposalHash: string;
  /** Compute proposalHash from the live file (re-imported here to avoid a cyclical import). */
  computeProposalHash: (proposal: CompactionProposal, file: string) => string;
  /** Synthetic runId stamped into the merged sentinels. Defaults to `merge-<ISO>`. */
  runId?: string;
  /** Override `Date.now`/timestamp for deterministic tests. Defaults to `new Date().toISOString()`. */
  now?: () => string;
}

export type ApplyCompactionResult =
  | {
      kind: "applied";
      bytesBefore: number;
      bytesAfter: number;
      clustersApplied: number;
      sectionsMerged: number;
      runId: string;
    }
  | {
      kind: "drift-rejected";
      reason:
        | "proposal-hash"
        | "missing-section"
        | "warnings-present"
        | "no-clusters"
        | "missing-file";
      details: string;
    };

/**
 * Apply a Phase A proposal to the agent's CLAUDE.md.
 *
 * Steps (all under `withFileLock(filePath)` so the read/validate/rewrite/
 * rename sequence is atomic against `appendBlock` / `expireSentinels`):
 *
 *  1. Re-read the file. Reject if the proposalHash recomputed against the
 *     current bytes doesn't match the stored hash (file drifted between
 *     plan and confirm — re-propose required).
 *  2. Re-parse sections. Reject if any cluster references a sectionId that
 *     no longer exists.
 *  3. Re-run the collapsed-distinct-rules validator against the live
 *     parse. Phase A treats warnings as advisory; Phase B treats them as
 *     hard rejections (per #162: "if two source sections cite different
 *     past-incident dates and the merged body cites only one, reject").
 *  4. Splice the file: keep the prelude + every non-clustered section
 *     verbatim, replace each cluster's first source section with one
 *     synthesized merged block, drop the rest. Emit via tmp + atomic
 *     rename (same write pattern as `appendBlock`).
 *
 * The synthesized sentinel uses the issue spec shape:
 *   <!-- run:merge-<runId> issue:#<N1>+#<N2>+#<N3> outcome:compacted ts:<ISO> -->
 * `parseClaudeMdSections` and `parseSentinelHeader` accept this compound ID
 * shape (see `SECTION_RE` in split.ts and `SENTINEL_RE` in sentinels.ts), so
 * a compacted block re-parses as a single section carrying every source ID.
 */
export async function applyCompaction(
  input: ApplyCompactionInput,
): Promise<ApplyCompactionResult> {
  if (input.proposal.clusters.length === 0) {
    return {
      kind: "drift-rejected",
      reason: "no-clusters",
      details: "Proposal has zero clusters; nothing to apply.",
    };
  }
  const filePath = agentClaudeMdPath(input.agentId);
  return withFileLock(filePath, async () => {
    let currentFile: string;
    try {
      currentFile = await fs.readFile(filePath, "utf-8");
    } catch {
      return {
        kind: "drift-rejected",
        reason: "missing-file",
        details: `agents/${input.agentId}/CLAUDE.md no longer exists; nothing to compact.`,
      };
    }

    const computedHash = input.computeProposalHash(input.proposal, currentFile);
    if (computedHash !== input.expectedProposalHash) {
      return {
        kind: "drift-rejected",
        reason: "proposal-hash",
        details:
          "CLAUDE.md content changed between --apply and --confirm. Re-run --apply to generate a fresh proposal + token.",
      };
    }

    const sections = parseClaudeMdSectionsWithOffsets(currentFile);
    const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
    for (const c of input.proposal.clusters) {
      for (const sid of c.sectionIds) {
        if (!sectionById.has(sid)) {
          return {
            kind: "drift-rejected",
            reason: "missing-section",
            details: `Cluster references sectionId ${sid} which is not present in the current parse.`,
          };
        }
      }
    }

    const warnings = findDroppedIncidentDates(
      { clusters: input.proposal.clusters },
      sections,
    );
    if (warnings.length > 0) {
      const summary = warnings
        .map(
          (w) =>
            `cluster[${w.clusterIndex}] dropped ${w.missingDates.join(",")}`,
        )
        .join("; ");
      return {
        kind: "drift-rejected",
        reason: "warnings-present",
        details: `Collapsed-distinct-rules validator flagged the proposal at apply time: ${summary}. Re-run --apply.`,
      };
    }

    const runId = input.runId ?? defaultMergeRunId(input.now);
    const ts = input.now?.() ?? new Date().toISOString();
    const rewritten = spliceCompactedSections({
      currentFile,
      sections,
      clusters: input.proposal.clusters,
      runId,
      ts,
    });

    const tmp = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, rewritten);
    await fs.rename(tmp, filePath);

    const sectionsMerged = input.proposal.clusters.reduce(
      (acc, c) => acc + c.sectionIds.length,
      0,
    );
    return {
      kind: "applied",
      bytesBefore: Buffer.byteLength(currentFile, "utf-8"),
      bytesAfter: Buffer.byteLength(rewritten, "utf-8"),
      clustersApplied: input.proposal.clusters.length,
      sectionsMerged,
      runId,
    };
  });
}

function defaultMergeRunId(now?: () => string): string {
  const iso = now?.() ?? new Date().toISOString();
  // Match the makeRunId() shape (`run-<ISO with : and . replaced by ->`)
  // so the runId is filesystem-safe and lex-sorts chronologically. Prefix
  // with `merge-` so a future audit (`grep run:merge- agents/...`) can
  // identify compaction-emitted blocks.
  const safe = iso.replace(/[:.]/g, "-");
  return `merge-${safe}`;
}

// Position-aware section parser used by Phase B's splicer. Same regex as
// `parseClaudeMdSections` (re-imported from split.ts so the shape stays
// in sync) but capture offsets too. Parallel sectionId numbering matches
// what `parseClaudeMdSections` produces, so cluster.sectionIds bind
// stable across both views.
interface SectionWithOffset extends ParsedSection {
  /** Char offset of the first char of `<!--` in the section's sentinel. */
  fileStart: number;
  /** Char offset just past the section's body (lookahead position). */
  fileEnd: number;
}

const SECTION_RE_WITH_OFFSETS =
  /<!--\s*run:(\S+)\s+issue:#(\d+(?:\+#\d+)*)\s+outcome:(\S+)\s+ts:\S+\s*-->\s*\n##\s+(.+?)\n([\s\S]*?)(?=\n<!--\s*run:|$)/g;

function parseClaudeMdSectionsWithOffsets(md: string): SectionWithOffset[] {
  const out: SectionWithOffset[] = [];
  let i = 0;
  for (const m of md.matchAll(SECTION_RE_WITH_OFFSETS)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const issueIds = m[2]
      .split("+")
      .map((tok) => Number(tok.replace(/^#/, "")));
    const section: SectionWithOffset = {
      sectionId: `s${i++}`,
      runId: m[1],
      issueId: issueIds[0],
      outcome: m[3],
      heading: m[4].trim(),
      body: m[5].trim(),
      fileStart: start,
      fileEnd: end,
    };
    if (issueIds.length > 1) section.issueIds = issueIds;
    out.push(section);
  }
  return out;
}

interface SpliceInput {
  currentFile: string;
  sections: SectionWithOffset[];
  clusters: CompactionCluster[];
  runId: string;
  ts: string;
}

/**
 * Walk sections in file order. For sections that aren't part of a cluster,
 * emit their original bytes. For each cluster, emit the merged block once,
 * at the position of its first source section in file order; drop the
 * rest. Inter-block separators (the single `\n` between sentinels) follow
 * the section they precede — when a section is dropped, its leading `\n`
 * goes with it so the rewritten file stays well-formed.
 */
export function spliceCompactedSections(input: SpliceInput): string {
  const sectionIdOrder = new Map<string, number>();
  input.sections.forEach((s, idx) => sectionIdOrder.set(s.sectionId, idx));

  // For each cluster, the canonical position is its earliest member in
  // file order. The other members are dropped during the walk.
  const clusterByCanonicalId = new Map<string, CompactionCluster>();
  const skipSectionIds = new Set<string>();
  for (const c of input.clusters) {
    let canonicalIdx = Infinity;
    let canonicalId = c.sectionIds[0];
    for (const sid of c.sectionIds) {
      const idx = sectionIdOrder.get(sid);
      if (idx === undefined) continue;
      if (idx < canonicalIdx) {
        canonicalIdx = idx;
        canonicalId = sid;
      }
    }
    clusterByCanonicalId.set(canonicalId, c);
    for (const sid of c.sectionIds) {
      if (sid !== canonicalId) skipSectionIds.add(sid);
    }
  }

  if (input.sections.length === 0) return input.currentFile;

  // Prelude = everything before the first section's sentinel.
  let out = input.currentFile.slice(0, input.sections[0].fileStart);

  for (let i = 0; i < input.sections.length; i++) {
    const sec = input.sections[i];
    const isSkipped = skipSectionIds.has(sec.sectionId);
    if (!isSkipped) {
      const cluster = clusterByCanonicalId.get(sec.sectionId);
      if (cluster) {
        out += renderMergedBlock(cluster, input.runId, input.ts);
      } else {
        out += input.currentFile.slice(sec.fileStart, sec.fileEnd);
      }
    }
    if (i < input.sections.length - 1) {
      const sep = input.currentFile.slice(
        sec.fileEnd,
        input.sections[i + 1].fileStart,
      );
      // Each section "owns" the separator that follows it. If we dropped
      // the section, drop the trailing separator too — otherwise we'd
      // accumulate stray `\n`s where the merged block doesn't need them.
      if (!isSkipped) out += sep;
    } else if (!isSkipped) {
      // Last section was kept — emit any trailing content (typically a
      // trailing `\n` written by `appendBlock`).
      out += input.currentFile.slice(sec.fileEnd);
    } else {
      // Last section was skipped — preserve trailing content of the file
      // (the `appendBlock`-written trailing `\n`) so the file still ends
      // with a newline.
      out += input.currentFile.slice(sec.fileEnd);
    }
  }
  return out;
}

/**
 * Render a single merged block with the issue-#162 sentinel shape:
 *
 *   <!-- run:<runId> issue:#<N1>+#<N2>+#<N3> outcome:compacted ts:<ISO> -->
 *   ## <heading>
 *
 *   <body>
 *
 * No trailing newline — the caller (splicer) emits inter-block separators.
 */
export function renderMergedBlock(
  cluster: CompactionCluster,
  runId: string,
  ts: string,
): string {
  const ids = Array.from(
    new Set(cluster.sourceProvenance.map((p) => p.issueId)),
  ).sort((a, b) => a - b);
  // Compound issue token: `#100+#101+#102`. The first `#` is in front of
  // the literal in the regex (`issue:#(\d+...)`) so each tok includes its
  // own `#` from index 1 onwards; here we prepend `#` to all and join.
  const idToken = ids.length > 0 ? ids.map((n) => `#${n}`).join("+") : "#0";
  const sentinel = `<!-- run:${runId} issue:${idToken} outcome:compacted ts:${ts} -->`;
  const heading = `## ${cluster.proposedHeading.trim()}`;
  const body = cluster.proposedBody.trim();
  return `${sentinel}\n${heading}\n\n${body}`;
}
