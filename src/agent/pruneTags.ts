// Tag pruning for over-broad agent registries (#219).
//
// Two phases:
//   Phase 1 (deterministic): drop registry tags not present in the
//     section-tag union. Sentinels carry `tags:t1,t2` provenance per
//     `appendBlock` (#142); the union of those tags across all attributable
//     sections is the lesson-backed tag set.
//   Phase 2 (LLM): cluster the lesson-backed tags into broader categories
//     where ≥2 fine-grained tags share a coherent thesis. Optional —
//     `--no-generalize` skips this step.
//
// Two-step token gate mirrors `lessonPrune` (#179) and `compactClaudeMd`
// (#162) so the destructive registry mutation requires explicit operator
// review between proposal and apply:
//   vp-dev agents prune-tags <agentId>           # advisory
//   vp-dev agents prune-tags <agentId> --apply   # mints token
//   vp-dev agents prune-tags <agentId> --confirm <token>   # mutates registry
//
// Hash binding rejects the confirm if the registry tag list OR CLAUDE.md
// drifted between plan and confirm (concurrent run completing, hand-edit,
// summarizer append).

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { agentClaudeMdPath } from "./specialization.js";
import { claudeBinPath } from "./sdkBinary.js";
import { mutateRegistry } from "../state/registry.js";
import { parseJsonEnvelope } from "../util/parseJsonEnvelope.js";
import { parseSentinelHeader } from "../util/sentinels.js";
import { ORCHESTRATOR_MODEL_SPLIT } from "../orchestrator/models.js";
import type { AgentRecord } from "../types.js";

const PROPOSAL_MODEL = ORCHESTRATOR_MODEL_SPLIT;
const MAX_CLUSTERS = 5;
const RATIONALE_MAX = 500;
const TO_NAME_MAX = 40;
const GENERAL_TAG = "general";

export interface GeneralizationCluster {
  /** ≥ 2 fine-grained tags from `sectionTagsUnion`. Each input tag appears in
   * at most one cluster. */
  from: string[];
  /** Generalized parent name (lowercase, hyphenated, ≤40 chars). */
  to: string;
  rationale: string;
}

export interface PruneTagsProposal {
  agentId: string;
  generatedAt: string;
  /** Snapshot of agent.tags at plan time — sorted, deduped. */
  registryTagsBefore: string[];
  /** Union of `tags:` provenance fields across attributable sentinels. */
  sectionTagsUnion: string[];
  /** Number of `<!-- run:... -->` sentinels parsed from CLAUDE.md. */
  attributableSections: number;
  /** registryTagsBefore ∖ sectionTagsUnion (lesson-unbacked). Sorted. */
  orphanTags: string[];
  /** LLM-proposed merge clusters. Empty when generalization is skipped or
   * the lesson-backed set is too small / too uniform to cluster. */
  generalizationClusters: GeneralizationCluster[];
  /** Lesson-backed tags not folded into any cluster. Sorted. */
  ungeneralizedKept: string[];
  /** The post-prune tag set the registry will receive on apply. Sorted,
   * deduped, with floor-protection applied (≥1 tag; `general` stripped when
   * other tags survive, reinstated only if the set would otherwise be empty). */
  finalTags: string[];
  /** Optional advisory text — surfaces "no attributable sections" /
   * "generalization skipped" / etc. */
  notes?: string;
}

const ClusterSchema = z.object({
  from: z.array(z.string().min(1)).min(2).max(20),
  to: z.string().min(1).max(TO_NAME_MAX),
  rationale: z.string().min(1).max(RATIONALE_MAX),
});

const ProposalSchema = z.object({
  clusters: z.array(ClusterSchema).max(MAX_CLUSTERS).default([]),
  ungeneralized: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

function clampClusterFields(json: unknown): unknown {
  // Trim oversize rationales / `to` names before Zod runs so a slightly-verbose
  // model output doesn't discard the entire proposal. Same belt-and-suspenders
  // pattern as split.ts:181 and the summarizer.
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
    if (typeof cluster.to === "string" && cluster.to.length > TO_NAME_MAX) {
      out.to = cluster.to.slice(0, TO_NAME_MAX - 3) + "...";
    }
    return out;
  });
  return { ...obj, clusters: next };
}

/**
 * Parse a CLAUDE.md and return the union of all `tags:` provenance fields
 * across `<!-- run:... -->` sentinel comments, plus the count of sentinels
 * found. Sentinels written before tag-provenance landed (per #142) lack a
 * `tags:` field; they contribute nothing to the union but still count
 * toward the section total.
 */
export function parseSectionTagsUnion(
  claudeMd: string,
): { union: Set<string>; sectionCount: number } {
  const union = new Set<string>();
  let sectionCount = 0;
  for (const line of claudeMd.split("\n")) {
    const header = parseSentinelHeader(line.trim());
    if (!header) continue;
    sectionCount++;
    for (const t of header.tags) union.add(t);
  }
  return { union, sectionCount };
}

/**
 * Apply floor protection to a candidate post-prune tag set.
 * - Strip `general` if at least one other tag survives (matches the
 *   `isGeneralist` policy at routing.ts:73-79).
 * - Reinstate `["general"]` only when the set would otherwise be empty —
 *   keeps the agent visible to pickAgents instead of vanishing from
 *   Jaccard scoring entirely.
 */
export function applyTagFloor(tags: ReadonlySet<string>): string[] {
  const set = new Set(tags);
  if (set.size > 1) set.delete(GENERAL_TAG);
  if (set.size === 0) set.add(GENERAL_TAG);
  return [...set].sort();
}

export interface ProposePruneTagsInput {
  agent: AgentRecord;
  /** The agent's current CLAUDE.md content (or "" if missing). */
  claudeMd: string;
  /** When true, skip Phase 2 (LLM generalization); orphan-drop only. */
  noGeneralize?: boolean;
}

/**
 * Compute the prune proposal. Phase 1 is deterministic; Phase 2 fires the
 * LLM clusterer when `noGeneralize` is false AND there are ≥2 lesson-backed
 * tags to potentially cluster.
 */
export async function proposePruneTags(
  input: ProposePruneTagsInput,
): Promise<PruneTagsProposal> {
  const registryTagsBefore = [...new Set(input.agent.tags)].sort();
  const { union: sectionTagsUnion, sectionCount } = parseSectionTagsUnion(input.claudeMd);
  const sectionTagsSorted = [...sectionTagsUnion].sort();

  const registrySet = new Set(registryTagsBefore);
  const lessonBacked = new Set<string>();
  const orphans: string[] = [];
  for (const t of registrySet) {
    if (sectionTagsUnion.has(t)) lessonBacked.add(t);
    else orphans.push(t);
  }
  orphans.sort();

  // Empty-result paths: leave tags untouched and surface the reason
  // distinctly rather than silently dropping every tag.
  //
  // (a) Zero attributable sections — no signal at all.
  // (b) Sections present but EVERY one lacks `tags:` provenance — pre-#142
  //     legacy sentinels OR post-split children (split.ts:458 materializes
  //     child sections without `tags:`). Lesson-backed evidence is empty
  //     for the wrong reason; pruning would gut the agent on missing data.
  if (sectionCount === 0 || sectionTagsUnion.size === 0) {
    const notes =
      sectionCount === 0
        ? "No attributable sections in CLAUDE.md (no <!-- run:... --> sentinels). Tags untouched."
        : `All ${sectionCount} attributable section(s) lack tag provenance (pre-#142 sentinels or post-split children). Tags untouched — re-run after the agent accumulates sections with tags.`;
    return {
      agentId: input.agent.agentId,
      generatedAt: new Date().toISOString(),
      registryTagsBefore,
      sectionTagsUnion: sectionTagsSorted,
      attributableSections: sectionCount,
      orphanTags: [],
      generalizationClusters: [],
      ungeneralizedKept: [],
      finalTags: registryTagsBefore,
      notes,
    };
  }

  // Phase 1 only: skip the LLM call.
  if (input.noGeneralize || lessonBacked.size < 2) {
    const finalTags = applyTagFloor(lessonBacked);
    const noteParts: string[] = [];
    if (input.noGeneralize) noteParts.push("Phase 2 skipped (--no-generalize).");
    if (lessonBacked.size < 2) {
      noteParts.push(
        `Only ${lessonBacked.size} lesson-backed tag(s); generalization needs ≥2.`,
      );
    }
    return {
      agentId: input.agent.agentId,
      generatedAt: new Date().toISOString(),
      registryTagsBefore,
      sectionTagsUnion: sectionTagsSorted,
      attributableSections: sectionCount,
      orphanTags: orphans,
      generalizationClusters: [],
      ungeneralizedKept: [...lessonBacked].sort(),
      finalTags,
      notes: noteParts.length ? noteParts.join(" ") : undefined,
    };
  }

  // Phase 2: LLM call.
  const llmResult = await runGeneralizationLLM(lessonBacked);
  // Defensive validation: every cluster.from tag must be in lesson-backed
  // set; cluster.from sets must be disjoint; ungeneralized + clusters must
  // cover the lesson-backed set with no extras.
  const claimed = new Set<string>();
  const validClusters: GeneralizationCluster[] = [];
  for (const c of llmResult.clusters) {
    let valid = true;
    for (const t of c.from) {
      if (!lessonBacked.has(t) || claimed.has(t)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    for (const t of c.from) claimed.add(t);
    validClusters.push({
      from: [...c.from].sort(),
      to: c.to,
      rationale: c.rationale,
    });
  }
  const ungeneralized: string[] = [];
  for (const t of lessonBacked) if (!claimed.has(t)) ungeneralized.push(t);
  ungeneralized.sort();

  const finalSet = new Set<string>();
  for (const t of ungeneralized) finalSet.add(t);
  for (const c of validClusters) finalSet.add(c.to);
  const finalTags = applyTagFloor(finalSet);

  return {
    agentId: input.agent.agentId,
    generatedAt: new Date().toISOString(),
    registryTagsBefore,
    sectionTagsUnion: sectionTagsSorted,
    attributableSections: sectionCount,
    orphanTags: orphans,
    generalizationClusters: validClusters,
    ungeneralizedKept: ungeneralized,
    finalTags,
    notes: llmResult.notes,
  };
}

const GENERALIZATION_SYSTEM_PROMPT = `You cluster an agent's fine-grained tags into broader generalized categories.

Input: a list of fine-grained tags this agent has used in actual kept lessons (CLAUDE.md sections). Each tag is a domain label like "cli-flag-sugar", "rogue-mcp-collude", "cost-surface", etc.

Your job: identify clusters of 2+ tags that share a coherent thesis and could be merged under a single broader name. Tags that don't coherently fit any cluster stay ungeneralized.

Output rules:
- 0 to 5 clusters. Empty array is fine if nothing clusters cleanly — better to leave tags ungeneralized than force them.
- Each cluster:
  - "from": ≥2 distinct tags drawn EXACTLY from the input list (no rephrasing, no new tokens).
  - "to": 1-40 character generalized parent name. Lowercase, hyphenated. Should be broader than "from" but still meaningfully descriptive — NOT generic like "tooling", "code", "system", "general".
  - "rationale": 1-3 sentences (≤500 chars) on why these tags share a thesis.
- Each input tag appears in AT MOST ONE cluster.from.
- Tags not in any cluster.from go in "ungeneralized" (or are simply absent — both treated the same downstream).
- "notes": optional 1-2 sentence advisory.
- JSON only, no fences, no prose outside the object.`;

function buildGeneralizationPrompt(lessonBacked: Set<string>): string {
  const tags = [...lessonBacked].sort();
  return `Cluster these ${tags.length} lesson-backed tag(s) into broader generalizations:

${JSON.stringify(tags)}

Output JSON: {"clusters": [{"from": ["...", "..."], "to": "...", "rationale": "..."}, ...], "ungeneralized": ["..."], "notes": "..."}`;
}

interface LlmClusterRaw {
  clusters: { from: string[]; to: string; rationale: string }[];
  ungeneralized: string[];
  notes?: string;
}

async function runGeneralizationLLM(lessonBacked: Set<string>): Promise<LlmClusterRaw> {
  const userPrompt = buildGeneralizationPrompt(lessonBacked);
  let raw = "";
  const stream = query({
    prompt: userPrompt,
    options: {
      model: PROPOSAL_MODEL,
      systemPrompt: GENERALIZATION_SYSTEM_PROMPT,
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
      else throw new Error(`generalization clusterer failed: ${msg.subtype}`);
    }
  }
  const extracted = parseJsonEnvelope(raw, z.unknown());
  if (!extracted.ok) {
    throw new Error(
      `generalization clusterer output not valid JSON: ${raw.slice(0, 200)}`,
    );
  }
  const clamped = clampClusterFields(extracted.value);
  const parsed = ProposalSchema.safeParse(clamped);
  if (!parsed.success) {
    throw new Error(
      `generalization clusterer schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 400)}`,
    );
  }
  return {
    clusters: parsed.data.clusters,
    ungeneralized: parsed.data.ungeneralized,
    notes: parsed.data.notes,
  };
}

export function formatPruneTagsProposal(p: PruneTagsProposal): string {
  const lines: string[] = [];
  lines.push(`Tag-prune proposal for ${p.agentId}`);
  lines.push("=".repeat(`Tag-prune proposal for ${p.agentId}`.length));
  lines.push(`  Registry tags (before): ${p.registryTagsBefore.length}`);
  lines.push(`  Attributable sections:  ${p.attributableSections}`);

  // Empty-result branch (zero sections OR every section lacks tag provenance):
  // skip the orphan/lesson-backed breakdown (they'd render as misleading
  // 0-of-N or N-of-N counts) and surface the notes line as the headline.
  const emptyResult = p.sectionTagsUnion.length === 0;
  if (emptyResult) {
    lines.push(`  Final tag set (${p.finalTags.length}): unchanged`);
    if (p.notes) {
      lines.push("");
      lines.push(`  Notes: ${p.notes}`);
    }
    return lines.join("\n");
  }

  lines.push(`  Section-tags union:     ${p.sectionTagsUnion.length}`);
  lines.push(`  Orphan tags (drop):     ${p.orphanTags.length}`);
  lines.push(`  Lesson-backed (keep):   ${p.registryTagsBefore.length - p.orphanTags.length}`);

  if (p.generalizationClusters.length > 0) {
    lines.push("");
    lines.push(`  Generalization clusters (${p.generalizationClusters.length}):`);
    for (const c of p.generalizationClusters) {
      lines.push(`    ${c.from.join(" + ")} -> ${c.to}`);
      lines.push(`      why: ${c.rationale}`);
    }
    if (p.ungeneralizedKept.length > 0) {
      lines.push(
        `  Ungeneralized (${p.ungeneralizedKept.length}): ${p.ungeneralizedKept.join(", ")}`,
      );
    }
  }

  lines.push("");
  lines.push(`  Final tag set (${p.finalTags.length}): ${p.finalTags.join(", ")}`);
  if (p.notes) {
    lines.push("");
    lines.push(`  Notes: ${p.notes}`);
  }
  if (p.orphanTags.length === 0 && p.generalizationClusters.length === 0) {
    lines.push("");
    lines.push("  Nothing to prune. Registry tags already match the lesson-backed set.");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Two-step token binding.
// ---------------------------------------------------------------------------

export function hashString(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * proposalHash = sha256(JSON.stringify(proposalCore) + sha256(currentTags) + sha256(currentClaudeMd))
 *
 * `proposalCore` is the deterministic part of the proposal (finalTags +
 * generalization shape) so re-deriving the hash after stable-sort yields
 * the same value regardless of LLM chatter (rationale wording, etc. are
 * captured via finalTags + cluster shape).
 */
export function computePruneTagsProposalHash(
  proposal: PruneTagsProposal,
  currentTags: string[],
  currentClaudeMd: string,
): string {
  const core = {
    agentId: proposal.agentId,
    finalTags: [...proposal.finalTags].sort(),
    clusters: [...proposal.generalizationClusters]
      .map((c) => ({ from: [...c.from].sort(), to: c.to }))
      .sort((a, b) => a.to.localeCompare(b.to)),
    orphanTags: [...proposal.orphanTags].sort(),
  };
  const sortedCurrentTags = [...currentTags].sort();
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(core))
    .update(hashString(JSON.stringify(sortedCurrentTags)))
    .update(hashString(currentClaudeMd))
    .digest("hex");
}

export interface ApplyPruneTagsInput {
  agentId: string;
  proposal: PruneTagsProposal;
  expectedProposalHash: string;
  /** Override CLAUDE.md path for tests; defaults to `agentClaudeMdPath`. */
  claudeMdPathOverride?: string;
}

export type ApplyPruneTagsResult =
  | {
      kind: "applied";
      tagsBefore: string[];
      tagsAfter: string[];
      droppedCount: number;
      generalizedCount: number;
    }
  | {
      kind: "drift-rejected";
      reason: "proposal-hash" | "missing-agent" | "archived-agent";
      details: string;
    };

export async function applyPruneTags(
  input: ApplyPruneTagsInput,
): Promise<ApplyPruneTagsResult> {
  const filePath = input.claudeMdPathOverride ?? agentClaudeMdPath(input.agentId);
  let currentClaudeMd = "";
  try {
    currentClaudeMd = await fs.readFile(filePath, "utf-8");
  } catch {
    // Missing CLAUDE.md is fine for the registry mutation — we still rebind
    // the hash against an empty file. If the proposal expected non-empty
    // content, the hash check below will catch the drift.
  }

  return mutateRegistry(async (reg) => {
    const agent = reg.agents.find((a) => a.agentId === input.agentId);
    if (!agent) {
      return {
        kind: "drift-rejected" as const,
        reason: "missing-agent" as const,
        details: `Agent '${input.agentId}' not found in registry.`,
      };
    }
    if (agent.archived) {
      return {
        kind: "drift-rejected" as const,
        reason: "archived-agent" as const,
        details: `Agent '${input.agentId}' is archived; cannot mutate tags.`,
      };
    }
    const computed = computePruneTagsProposalHash(
      input.proposal,
      agent.tags,
      currentClaudeMd,
    );
    if (computed !== input.expectedProposalHash) {
      return {
        kind: "drift-rejected" as const,
        reason: "proposal-hash" as const,
        details:
          "Registry tag list or CLAUDE.md changed between --apply and --confirm. Re-run --apply to generate a fresh proposal + token.",
      };
    }
    const tagsBefore = [...agent.tags].sort();
    const tagsAfter = [...input.proposal.finalTags];
    const beforeSet = new Set(tagsBefore);
    const afterSet = new Set(tagsAfter);
    let dropped = 0;
    for (const t of beforeSet) if (!afterSet.has(t)) dropped++;
    agent.tags = tagsAfter;
    return {
      kind: "applied" as const,
      tagsBefore,
      tagsAfter,
      droppedCount: dropped,
      generalizedCount: input.proposal.generalizationClusters.length,
    };
  });
}
