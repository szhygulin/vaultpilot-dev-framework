import { promises as fs } from "node:fs";
import path from "node:path";
import { agentClaudeMdPath, agentDir, AGENTS_ROOT } from "./specialization.js";
import { mutateRegistry } from "../state/registry.js";
import { jaccard } from "../orchestrator/routing.js";
import { ensureDir } from "../state/locks.js";
import type { AgentRecord, AgentRegistryFile } from "../types.js";

// Tag-set Jaccard floor that promotes a pair of specialists from "incidental
// overlap" to "merge candidate". Tuned to match the reverse direction of
// SPECIALIST_THRESHOLD (0.25 routes an issue to an agent) — at 0.75 the two
// agents share roughly three quarters of their tag vocabulary, signalling
// they cover the same niche.
export const MERGE_SIMILARITY_THRESHOLD = 0.75;

export const ARCHIVE_DIR_NAME = ".archive";

export type PruneProposal = {
  kind: "merge";
  survivor: string;
  absorbed: string;
  survivorName?: string;
  absorbedName?: string;
  similarity: number;
  rationale: string;
};

// Retire proposals are deferred until outcome metrics from #36 land. The
// detection function intentionally never emits them today — the plan
// explicitly forbids guessing without merge-rate / staleness data.

export interface DetectInput {
  registry: AgentRegistryFile;
}

/**
 * Pairwise tag-set Jaccard similarity over live (non-archived) agents.
 * Pairs with similarity >= MERGE_SIMILARITY_THRESHOLD become merge
 * proposals. Greedy: each agent appears in at most one proposal per call —
 * higher-similarity pairs win.
 */
export function detectPruneCandidates(input: DetectInput): PruneProposal[] {
  const live = input.registry.agents.filter((a) => !a.archived);
  if (live.length < 2) return [];

  type Candidate = { a: AgentRecord; b: AgentRecord; sim: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const sim = jaccard(live[i].tags, live[j].tags);
      if (sim >= MERGE_SIMILARITY_THRESHOLD) {
        candidates.push({ a: live[i], b: live[j], sim });
      }
    }
  }
  // Highest similarity first; deterministic tiebreak on the lower agentId
  // of the pair so re-running over the same registry produces the same
  // ordering.
  candidates.sort((x, y) => {
    if (y.sim !== x.sim) return y.sim - x.sim;
    const lx = x.a.agentId < x.b.agentId ? x.a.agentId : x.b.agentId;
    const ly = y.a.agentId < y.b.agentId ? y.a.agentId : y.b.agentId;
    return lx.localeCompare(ly);
  });

  const used = new Set<string>();
  const out: PruneProposal[] = [];
  for (const c of candidates) {
    if (used.has(c.a.agentId) || used.has(c.b.agentId)) continue;
    const [survivor, absorbed] = pickSurvivor(c.a, c.b);
    out.push({
      kind: "merge",
      survivor: survivor.agentId,
      absorbed: absorbed.agentId,
      survivorName: survivor.name,
      absorbedName: absorbed.name,
      similarity: c.sim,
      rationale: `tag-set Jaccard=${c.sim.toFixed(2)} >= ${MERGE_SIMILARITY_THRESHOLD}; survivor issuesHandled=${survivor.issuesHandled}, absorbed=${absorbed.issuesHandled}`,
    });
    used.add(survivor.agentId);
    used.add(absorbed.agentId);
  }
  return out;
}

/**
 * Survivor selection: higher `issuesHandled` wins. Ties break to the older
 * `createdAt`, then to the lower `agentId`. Deterministic so the same
 * registry produces the same result on every detection pass.
 */
function pickSurvivor(
  a: AgentRecord,
  b: AgentRecord,
): [survivor: AgentRecord, absorbed: AgentRecord] {
  if (a.issuesHandled !== b.issuesHandled) {
    return a.issuesHandled > b.issuesHandled ? [a, b] : [b, a];
  }
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
    return ta < tb ? [a, b] : [b, a];
  }
  return a.agentId < b.agentId ? [a, b] : [b, a];
}

export interface ApplyResult {
  archivedTo: string;
  survivorClaudeMdBytes: number;
}

/**
 * Apply a prune proposal. One-way mutation. Caller is responsible for
 * having gathered explicit user confirmation upstream.
 *
 * Merge: survivor's CLAUDE.md absorbs the absorbed agent's
 * summarizer-attributable sections under a `<!-- merged from ... -->`
 * banner; survivor's tag set + counters absorb the absorbed agent's; the
 * absorbed agent's directory moves to `agents/.archive/<id>-merged-into-<survivor>-<ts>/`
 * and its registry record gains `archived: true` + `mergedInto: <survivor>`.
 */
export async function applyPruneProposal(p: PruneProposal): Promise<ApplyResult> {
  return await applyMerge(p);
}

async function applyMerge(
  p: Extract<PruneProposal, { kind: "merge" }>,
): Promise<ApplyResult> {
  const survivorMd = await readMd(p.survivor);
  const absorbedMd = await readMd(p.absorbed);
  const merged = concatForMerge({
    survivorMd,
    absorbedMd,
    survivorId: p.survivor,
    absorbedId: p.absorbed,
  });

  return await mutateRegistry(async (reg) => {
    const survivor = reg.agents.find((a) => a.agentId === p.survivor);
    if (!survivor) throw new Error(`survivor agent ${p.survivor} not found in registry`);
    if (survivor.archived) throw new Error(`survivor agent ${p.survivor} is archived`);
    const absorbed = reg.agents.find((a) => a.agentId === p.absorbed);
    if (!absorbed) throw new Error(`absorbed agent ${p.absorbed} not found in registry`);
    if (absorbed.archived) throw new Error(`absorbed agent ${p.absorbed} is already archived`);

    survivor.tags = dedupeStrings([...survivor.tags, ...absorbed.tags]);
    survivor.issuesHandled += absorbed.issuesHandled;
    survivor.implementCount += absorbed.implementCount;
    survivor.pushbackCount += absorbed.pushbackCount;
    survivor.errorCount += absorbed.errorCount;
    if (Date.parse(absorbed.lastActiveAt) > Date.parse(survivor.lastActiveAt)) {
      survivor.lastActiveAt = absorbed.lastActiveAt;
    }

    absorbed.archived = true;
    absorbed.mergedInto = p.survivor;

    const survivorPath = agentClaudeMdPath(p.survivor);
    await ensureDir(path.dirname(survivorPath));
    const tmp = `${survivorPath}.tmp.${process.pid}`;
    await fs.writeFile(tmp, merged);
    await fs.rename(tmp, survivorPath);

    const archiveTo = path.join(
      AGENTS_ROOT,
      ARCHIVE_DIR_NAME,
      `${p.absorbed}-merged-into-${p.survivor}-${tsSlug()}`,
    );
    await ensureDir(path.dirname(archiveTo));
    try {
      await fs.rename(agentDir(p.absorbed), archiveTo);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      // Absorbed agent's dir may not exist if the agent never had a
      // CLAUDE.md forked. Drop a marker so the archive path is observable.
      await ensureDir(archiveTo);
    }

    return {
      archivedTo: archiveTo,
      survivorClaudeMdBytes: Buffer.byteLength(merged, "utf-8"),
    };
  });
}

async function readMd(agentId: string): Promise<string> {
  try {
    return await fs.readFile(agentClaudeMdPath(agentId), "utf-8");
  } catch {
    return "";
  }
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function tsSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

interface ConcatInput {
  survivorMd: string;
  absorbedMd: string;
  survivorId: string;
  absorbedId: string;
}

/**
 * Append the absorbed agent's summarizer-attributable sections (everything
 * from the first `<!-- run:` provenance comment onward) to the survivor's
 * CLAUDE.md under a single banner comment. Survivor's seed + body are
 * preserved verbatim. The banner uses a `<!-- merged from ... -->` shape
 * that's distinct from `<!-- run: -->` so parseClaudeMdSections() in
 * split.ts ignores it.
 */
export function concatForMerge(input: ConcatInput): string {
  const idx = input.absorbedMd.search(/<!--\s*run:/);
  const absorbedAttributable = idx < 0 ? "" : input.absorbedMd.slice(idx);
  if (absorbedAttributable.trim().length === 0) {
    return input.survivorMd;
  }
  const banner = `<!-- merged from ${input.absorbedId} into ${input.survivorId} ts:${new Date().toISOString()} -->`;
  const tail = input.survivorMd.endsWith("\n") ? input.survivorMd : input.survivorMd + "\n";
  return `${tail}\n${banner}\n\n${absorbedAttributable.trim()}\n`;
}

export function formatPruneProposals(proposals: PruneProposal[]): string {
  if (proposals.length === 0) {
    return "No prune candidates — registry is healthy.\n";
  }
  const lines: string[] = [`${proposals.length} prune proposal(s):`, ""];
  for (const p of proposals) {
    const sLabel = p.survivorName ? `${p.survivorName} (${p.survivor})` : p.survivor;
    const aLabel = p.absorbedName ? `${p.absorbedName} (${p.absorbed})` : p.absorbed;
    lines.push(`  merge: keep ${sLabel}, absorb ${aLabel}  similarity=${p.similarity.toFixed(2)}`);
    lines.push(`    why: ${p.rationale}`);
  }
  lines.push("");
  lines.push("To apply: vp-dev agents prune --apply");
  return lines.join("\n") + "\n";
}
