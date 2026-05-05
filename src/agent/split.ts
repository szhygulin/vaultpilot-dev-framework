import { promises as fs } from "node:fs";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { agentClaudeMdPath, agentDir } from "./specialization.js";
import { claudeBinPath } from "./sdkBinary.js";
import { mutateRegistry, newAgentId } from "../state/registry.js";
import { pickName } from "../state/names.js";
import { ensureDir } from "../state/locks.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { ORCHESTRATOR_MODEL_SPLIT } from "../orchestrator/models.js";
import type { AgentRecord } from "../types.js";

// Thresholds for "this agent is overloaded enough to warrant splitting".
// Crossing ANY of the three is enough — they capture distinct overload
// shapes: many issues (volume), wide tag scatter (breadth), large memory
// file (rule sprawl).
export const SPLIT_THRESHOLD_ISSUES = 20;
export const SPLIT_THRESHOLD_TAGS = 50;
export const SPLIT_THRESHOLD_BYTES = 30 * 1024;

// Hard floor for the clusterer: with fewer than 4 attributable sections
// (`<!-- run:... -->`-prefixed blocks) there isn't enough signal to
// produce 2-3 coherent clusters. Crossed in `proposeSplit` and
// surfaced via `OverloadVerdict.attributableSections` so the
// pre-dispatch warning text can branch on splitter eligibility instead
// of pointing the user at `vp-dev agents split` for an agent the
// splitter will refuse (issue #161).
export const SPLIT_MIN_SECTIONS = 4;

// Resolved at module load from `models.ts` (env-overridable). See
// `src/orchestrator/models.ts` for tier rationale and override env vars.
const PROPOSAL_MODEL = ORCHESTRATOR_MODEL_SPLIT;
const MAX_CLUSTERS = 3;

export interface OverloadVerdict {
  agentId: string;
  reasons: string[];
  claudeMdBytes: number;
  /**
   * Count of `<!-- run:... -->`-prefixed sections in the agent's
   * CLAUDE.md — i.e. summarizer-attributable lessons. Surfaced so
   * pre-dispatch warning text can distinguish "overloaded AND
   * splittable" from "overloaded but section-floor blocks the
   * splitter" (issue #161).
   */
  attributableSections: number;
}

export function detectOverload(
  agent: AgentRecord,
  claudeMd: string,
): OverloadVerdict | null {
  const reasons: string[] = [];
  const claudeMdBytes = Buffer.byteLength(claudeMd, "utf-8");
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
  return {
    agentId: agent.agentId,
    reasons,
    claudeMdBytes,
    attributableSections: parseClaudeMdSections(claudeMd).length,
  };
}

export interface ParsedSection {
  // Identifier used by clusterer to refer to this section in proposed
  // partitions. Position-based, stable across calls on the same MD file.
  sectionId: string;
  runId?: string;
  /** Canonical / first issue ID. For non-compacted blocks, the only ID. */
  issueId?: number;
  /** Set on `outcome:compacted` blocks (issue #162) — the full list of
   * source issue IDs the merge spans. Undefined for single-issue blocks. */
  issueIds?: number[];
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
//
// `ts:` value is an ISO-8601 timestamp containing hyphens (`2026-05-01T...`),
// so the terminator must look for the literal `-->` rather than excluding
// hyphens. Section body terminates at the next provenance comment OR at
// EOF — the summarizer always re-emits the comment per appended block.
//
// `issue:#N` accepts compound IDs of the shape `#N1+#N2+#N3` (issue #162's
// `outcome:compacted` blocks) so re-running parsing on a post-merge file
// surfaces every compacted block as one section carrying every source ID.
// Single-issue blocks (`issue:#42`) match the same group with one element.
const SECTION_RE =
  /<!--\s*run:(\S+)\s+issue:#(\d+(?:\+#\d+)*)\s+outcome:(\S+)\s+ts:\S+\s*-->\s*\n##\s+(.+?)\n([\s\S]*?)(?=\n<!--\s*run:|$)/g;

export function parseIssueIdsFromCapture(raw: string): number[] {
  // Split `100+#101+#102` → ["100", "#101", "#102"] → [100, 101, 102].
  return raw.split("+").map((tok) => Number(tok.replace(/^#/, "")));
}

export function parseClaudeMdSections(md: string): ParsedSection[] {
  const out: ParsedSection[] = [];
  let i = 0;
  for (const m of md.matchAll(SECTION_RE)) {
    const issueIds = parseIssueIdsFromCapture(m[2]);
    const section: ParsedSection = {
      sectionId: `s${i++}`,
      runId: m[1],
      issueId: issueIds[0],
      outcome: m[3],
      heading: m[4].trim(),
      body: m[5].trim(),
    };
    // Only set when the section encodes multiple IDs — single-ID
    // sections stay deep-equal-comparable to the pre-#162 shape.
    if (issueIds.length > 1) section.issueIds = issueIds;
    out.push(section);
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

// Per-field caps. The Zod schema's max is the hard ceiling; clampClusterFields
// (called pre-validate) trims overshoots so a slightly-verbose rationale
// doesn't discard the entire proposal — same belt-and-suspenders pattern as
// the summarizer.
const RATIONALE_MAX = 1000;
const NAME_MAX = 60;

const ProposalSchema = z.object({
  clusters: z
    .array(
      z.object({
        proposedName: z.string().min(1).max(NAME_MAX),
        proposedTags: z.array(z.string().min(1)).min(1).max(20),
        sectionIds: z.array(z.string().min(1)).min(1),
        rationale: z.string().min(1).max(RATIONALE_MAX),
      }),
    )
    .min(2)
    .max(MAX_CLUSTERS),
  unclusteredSectionIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
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
    if (typeof cluster.rationale === "string" && cluster.rationale.length > RATIONALE_MAX) {
      out.rationale = cluster.rationale.slice(0, RATIONALE_MAX - 16) + "\n[…truncated]";
    }
    if (typeof cluster.proposedName === "string" && cluster.proposedName.length > NAME_MAX) {
      out.proposedName = cluster.proposedName.slice(0, NAME_MAX - 3) + "...";
    }
    return out;
  });
  return { ...obj, clusters: next };
}

export interface ProposeSplitInput {
  agent: AgentRecord;
  /** The agent's current CLAUDE.md (or seed if missing). */
  claudeMd: string;
}

export async function proposeSplit(
  input: ProposeSplitInput,
): Promise<SplitProposal> {
  const sections = parseClaudeMdSections(input.claudeMd);
  if (sections.length < SPLIT_MIN_SECTIONS) {
    // With fewer than SPLIT_MIN_SECTIONS attributable sections there's not
    // enough signal to split on — return a single-cluster "no-op" proposal
    // callers can render as "not enough history yet to split meaningfully".
    return {
      agentId: input.agent.agentId,
      parentTags: input.agent.tags,
      clusters: [],
      unclusteredSectionIds: sections.map((s) => s.sectionId),
      inputBytes: Buffer.byteLength(input.claudeMd, "utf-8"),
      sectionCount: sections.length,
      notes: `Too few attributable sections (<${SPLIT_MIN_SECTIONS}) to cluster meaningfully.`,
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
      pathToClaudeCodeExecutable: claudeBinPath(),
    },
  });
  for await (const msg of stream) {
    if (msg.type === "result") {
      if (msg.subtype === "success") raw = msg.result;
      else throw new Error(`split clusterer failed: ${msg.subtype}`);
    }
  }

  // Extract the JSON envelope without schema validation — clampClusterFields
  // needs to trim oversize rationales/names before ProposalSchema runs, so
  // pass `z.unknown()` and run safeParse ourselves below.
  const extracted = parseJsonEnvelope(raw, z.unknown());
  if (!extracted.ok) {
    throw new Error(`split clusterer output not valid JSON: ${raw.slice(0, 200)}`);
  }
  const clamped = clampClusterFields(extracted.value);
  const parsed = ProposalSchema.safeParse(clamped);
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
  return lines.join("\n");
}

export interface ApplySplitInput {
  proposal: SplitProposal;
  /** Original CLAUDE.md content used to source per-cluster sections. */
  parentClaudeMd: string;
}

export interface ApplySplitResult {
  parentAgentId: string;
  childIds: string[];
}

/**
 * Apply a split proposal: mint child agents (one per cluster), partition
 * the parent's CLAUDE.md sections into each child's CLAUDE.md, and mark
 * the parent as archived. One-way mutation. Caller is responsible for
 * having gathered explicit user confirmation upstream.
 *
 * Counters (issuesHandled, implementCount, pushbackCount, errorCount) are
 * divided evenly across children, rounded down. The remainder is silently
 * dropped — clean per-issue attribution would require tracking outcome
 * per CLAUDE.md section, which we don't, so even-division is the
 * auditable choice.
 */
export async function applySplit(input: ApplySplitInput): Promise<ApplySplitResult> {
  const proposal = input.proposal;
  if (proposal.clusters.length < 2) {
    throw new Error(
      `applySplit requires at least 2 clusters; proposal has ${proposal.clusters.length}.`,
    );
  }

  const sections = parseClaudeMdSections(input.parentClaudeMd);
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
  const seedPart = extractSeedPart(input.parentClaudeMd);

  const result = await mutateRegistry(async (reg) => {
    const parent = reg.agents.find((a) => a.agentId === proposal.agentId);
    if (!parent) throw new Error(`parent agent ${proposal.agentId} not found in registry`);
    if (parent.archived) throw new Error(`parent agent ${proposal.agentId} is already archived`);

    const childIds: string[] = [];
    const N = proposal.clusters.length;
    const splitInt = (total: number) => Math.floor(total / N);

    const takenAgentIds = new Set(reg.agents.map((a) => a.agentId));
    // Forward-compat: pre-PR-1 AgentRecord lacks `name`. Read defensively
    // through `unknown` so this PR can land before/after PR 1.
    const takenNames = new Set(
      reg.agents
        .map((a) => (a as unknown as { name?: string }).name)
        .filter((n): n is string => !!n),
    );

    for (const cluster of proposal.clusters) {
      let childId = newAgentId();
      while (takenAgentIds.has(childId)) childId = newAgentId();
      takenAgentIds.add(childId);

      // Display name: pull from the curated human-name pool, the same source
      // every freshly-minted agent uses. cluster.proposedName is a topical
      // section-heading phrase (e.g. "Rogue-MCP Trust Boundary") that reads
      // as a label rather than an identity — kept on the proposal for the
      // formatProposal log line, but not stored on the child record. Tags
      // already carry the routing/topic information.
      const name = pickName(childId, takenNames);
      takenNames.add(name);

      const now = new Date().toISOString();
      const child: AgentRecord = {
        agentId: childId,
        createdAt: now,
        tags: dedupeStrings([...cluster.proposedTags]),
        issuesHandled: splitInt(parent.issuesHandled),
        implementCount: splitInt(parent.implementCount),
        pushbackCount: splitInt(parent.pushbackCount),
        errorCount: splitInt(parent.errorCount),
        lastActiveAt: parent.lastActiveAt,
        parentAgentId: parent.agentId,
      };
      // Forward-compat: only attach `name` if the field exists on the type.
      // Older clones without the names PR ignore the extra field at JSON
      // round-trip; the type itself accepts unknown keys via JSON parse.
      (child as AgentRecord & { name?: string }).name = name;

      reg.agents.push(child);
      childIds.push(childId);

      // Materialize the child's CLAUDE.md: seed + each cluster section.
      const dir = agentDir(childId);
      await ensureDir(dir);
      const childMdParts: string[] = [];
      if (seedPart.trim().length > 0) childMdParts.push(seedPart.trim());
      for (const sid of cluster.sectionIds) {
        const sec = sectionById.get(sid);
        if (!sec) continue;
        const provenance = `<!-- run:${sec.runId ?? "?"} issue:#${sec.issueId ?? "?"} outcome:${sec.outcome ?? "?"} ts:${now} -->`;
        childMdParts.push(`${provenance}\n## ${sec.heading}\n\n${sec.body}`);
      }
      const childMd = childMdParts.join("\n\n") + "\n";
      const dest = agentClaudeMdPath(childId);
      const tmp = `${dest}.tmp.${process.pid}`;
      await fs.writeFile(tmp, childMd);
      await fs.rename(tmp, dest);
    }

    parent.archived = true;
    parent.archivedAt = new Date().toISOString();
    parent.splitInto = childIds;

    return { parentAgentId: parent.agentId, childIds };
  });

  return result;
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * Everything in the agent's CLAUDE.md before the first summarizer-appended
 * section (i.e. before the first `<!-- run:... -->` provenance comment).
 * That preamble is the seed copied at fork time — re-use it as the seed
 * for every child.
 */
function extractSeedPart(md: string): string {
  const idx = md.search(/<!--\s*run:/);
  return idx < 0 ? md : md.slice(0, idx);
}


