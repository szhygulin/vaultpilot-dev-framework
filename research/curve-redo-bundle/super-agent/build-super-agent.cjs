#!/usr/bin/env node
// Super-agent build (Phase A of feature-plans/super-agent-curve-experiment-plan.md):
// pool every eligible agent's CLAUDE.md into a single `agent-super` CLAUDE.md
// via Opus-driven cross-agent dedup.
//
// Eligibility: drop `agent-916a-trim-*`, `archived: true`, `mergedInto != null`,
// the naive `agent-8274`. (The plan estimated ~47 agents / ~1.3 MB; the actual
// machine state may have fewer materialized CLAUDE.mds — the eligibility filter
// returns only those with a real file present, falling back to the snapshot
// under `.claude/agents-snapshot/agents/<id>/CLAUDE.md` when the live file is
// missing. The retention gate below decides whether the result is usable.)
//
// Steps:
//   1. Filter the registry to eligible agents and read each agent's CLAUDE.md.
//   2. Concatenate into a synthetic super-pool MD with provenance-prefixed
//      sectionIds (`<agentId>:s<n>`) so the post-merge cluster output traces
//      back to a contributor.
//   3. Call `proposeCompaction()` with the pooled MD and a synthetic
//      `agent-super-pool` AgentRecord. The compaction system prompt at
//      compactClaudeMd.ts:438-462 mandates preservation of past-incident dates,
//      mechanisms, "Tells" / "How to apply" — exactly the union semantics needed.
//   4. Hard-gate on `findDroppedIncidentDates` and `findClampedBodies`: if any
//      cluster has warnings, abort without minting. The proposal is
//      authoritative; we don't apply a half-merged file.
//   5. Render the super-agent file: walk pooled sections in source order;
//      replace clustered members with `renderMergedBlock` at the canonical
//      (earliest) position, drop the rest; emit unclustered sections verbatim.
//   6. Mint `agent-super` via `ensureAgent` (explicit ID, set name + tags
//      directly on the record) and write the rendered file to
//      `agents/agent-super/CLAUDE.md`.
//
// Acceptance: retention % ∈ [25%, 50%] of input AND zero validator warnings.
// Outside that range, rerun with `MIN_CLUSTER_SIZE=2` (more aggressive) or
// `MIN_CLUSTER_SIZE=4` (less aggressive).
//
// Usage:
//   npm run build && node research/curve-redo-bundle/super-agent/build-super-agent.cjs
//
// Env overrides:
//   MIN_CLUSTER_SIZE   override proposeCompaction's minClusterSize (default 3)
//   AGENT_ID           override the minted ID (default "agent-super")
//   DRY_RUN            "1" → run dedup + render but skip mint + write

"use strict";

const path = require("node:path");
const fs = require("node:fs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DIST = path.join(REPO_ROOT, "dist", "src");
const SNAPSHOT_AGENTS = path.join(REPO_ROOT, ".claude", "agents-snapshot", "agents");
const AGENTS_DIR = path.join(REPO_ROOT, "agents");
const REGISTRY_FILE = path.join(REPO_ROOT, "state", "agents-registry.json");
const TARGET_AGENT_ID = process.env.AGENT_ID || "agent-super";
const TARGET_AGENT_NAME = "Super";
const TARGET_AGENT_TAGS = ["super-agent"];
const MIN_CLUSTER_SIZE = Number(process.env.MIN_CLUSTER_SIZE || 3);
const DRY_RUN = process.env.DRY_RUN === "1";

function requireDist(rel) {
  const p = path.join(DIST, rel);
  if (!fs.existsSync(p)) {
    process.stderr.write(`ERROR: ${p} missing — run \`npm run build\` first.\n`);
    process.exit(1);
  }
  return require(p);
}

function readClaudeMdForAgent(agentId) {
  const live = path.join(AGENTS_DIR, agentId, "CLAUDE.md");
  if (fs.existsSync(live)) return { source: "live", text: fs.readFileSync(live, "utf-8") };
  const snap = path.join(SNAPSHOT_AGENTS, agentId, "CLAUDE.md");
  if (fs.existsSync(snap)) return { source: "snap", text: fs.readFileSync(snap, "utf-8") };
  return null;
}

function isEligible(a) {
  if (a.agentId.startsWith("agent-916a-trim-")) return false;
  if (a.agentId === "agent-8274") return false;
  if (a.archived) return false;
  if (a.mergedInto) return false;
  return true;
}

async function main() {
  const compactMod = requireDist(path.join("agent", "compactClaudeMd.js"));
  const splitMod = requireDist(path.join("agent", "split.js"));
  const registryMod = requireDist(path.join("state", "registry.js"));
  const specMod = requireDist(path.join("agent", "specialization.js"));

  if (!fs.existsSync(REGISTRY_FILE)) {
    process.stderr.write(`ERROR: ${REGISTRY_FILE} missing.\n`);
    process.exit(1);
  }
  const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8"));
  const eligible = reg.agents.filter(isEligible);
  const contributors = [];
  for (const a of eligible) {
    const md = readClaudeMdForAgent(a.agentId);
    if (!md) continue;
    contributors.push({ agentId: a.agentId, source: md.source, text: md.text, tags: a.tags || [] });
  }
  if (contributors.length === 0) {
    process.stderr.write("ERROR: no eligible contributors with a CLAUDE.md.\n");
    process.exit(2);
  }

  // Build a pooled CLAUDE.md by concatenating each contributor's parsed
  // sections. We re-emit the original sentinel header verbatim — that's what
  // `parseClaudeMdSections` (compactClaudeMd's input) already keys on, so the
  // run/issue provenance carries into the proposal. Per-contributor preambles
  // (everything before the first sentinel) are dropped since they're seed
  // boilerplate that would otherwise dominate the input bytes.
  let pooled = "";
  let totalInputBytes = 0;
  let totalParsedSections = 0;
  const perAgentSections = [];
  for (const c of contributors) {
    totalInputBytes += Buffer.byteLength(c.text, "utf-8");
    const sections = splitMod.parseClaudeMdSections(c.text);
    totalParsedSections += sections.length;
    perAgentSections.push({ agentId: c.agentId, count: sections.length });
    if (sections.length === 0) continue;
    // Slice the contributor's CLAUDE.md from the first sentinel onward — that
    // preserves the verbatim sentinels for the parser. The first sentinel's
    // index isn't surfaced by parseClaudeMdSections, so locate it via the
    // same regex shape the parser uses.
    const firstSentinel = c.text.search(/<!--\s*run:\S+\s+issue:#\d+/);
    if (firstSentinel < 0) continue;
    pooled += c.text.slice(firstSentinel);
    if (!pooled.endsWith("\n")) pooled += "\n";
  }
  const pooledBytes = Buffer.byteLength(pooled, "utf-8");
  const pooledParsed = splitMod.parseClaudeMdSections(pooled);

  process.stderr.write(`[build-super-agent] eligible agents: ${eligible.length}\n`);
  process.stderr.write(`[build-super-agent] contributors with CLAUDE.md: ${contributors.length}\n`);
  process.stderr.write(`[build-super-agent] input bytes (raw): ${totalInputBytes} (${(totalInputBytes/1024).toFixed(1)} KB)\n`);
  process.stderr.write(`[build-super-agent] pooled bytes (post-preamble-strip): ${pooledBytes} (${(pooledBytes/1024).toFixed(1)} KB)\n`);
  process.stderr.write(`[build-super-agent] sentinel-tagged sections: ${pooledParsed.length} (sum across contributors: ${totalParsedSections})\n`);
  process.stderr.write(`[build-super-agent] minClusterSize: ${MIN_CLUSTER_SIZE}\n`);

  if (pooledParsed.length < MIN_CLUSTER_SIZE) {
    process.stderr.write(`ERROR: pooled MD has ${pooledParsed.length} attributable sections — below minClusterSize=${MIN_CLUSTER_SIZE}. Compaction would no-op.\n`);
    process.exit(3);
  }

  // Synthetic AgentRecord shape that proposeCompaction expects: agentId +
  // tags. The agentId is informational (lands in the proposal's `agentId`
  // field); tags are echoed in the user prompt.
  const tagsUnion = Array.from(new Set(contributors.flatMap((c) => c.tags))).sort();
  const synthetic = {
    agentId: "agent-super-pool",
    name: "SuperPool",
    createdAt: new Date().toISOString(),
    tags: tagsUnion,
    issuesHandled: 0,
    implementCount: 0,
    pushbackCount: 0,
    errorCount: 0,
    lastActiveAt: new Date().toISOString(),
  };

  process.stderr.write(`[build-super-agent] tag union: ${tagsUnion.length} tags\n`);
  process.stderr.write(`[build-super-agent] dispatching proposeCompaction (model=${process.env.VP_DEV_ORCHESTRATOR_MODEL_SPLIT || "<default opus>"})...\n`);

  const t0 = Date.now();
  const proposal = await compactMod.proposeCompaction({
    agent: synthetic,
    claudeMd: pooled,
    minClusterSize: MIN_CLUSTER_SIZE,
  });
  const elapsedMs = Date.now() - t0;

  process.stderr.write(`[build-super-agent] proposeCompaction returned in ${(elapsedMs/1000).toFixed(1)}s\n`);
  process.stderr.write(`[build-super-agent]   clusters proposed:     ${proposal.clusters.length}\n`);
  process.stderr.write(`[build-super-agent]   unclustered sections:  ${proposal.unclusteredSectionIds.length}\n`);
  process.stderr.write(`[build-super-agent]   estimated bytes saved: ${proposal.estimatedBytesSaved}\n`);
  process.stderr.write(`[build-super-agent]   validator warnings:    ${proposal.warnings.length}\n`);
  if (proposal.notes) process.stderr.write(`[build-super-agent]   notes: ${proposal.notes}\n`);
  if (proposal.warnings.length > 0) {
    for (const w of proposal.warnings) {
      if (w.kind === "dropped-incident-date") {
        process.stderr.write(`    ⚠ DROPPED DATES cluster=${w.clusterIndex}: ${w.missingDates.join(", ")} (from ${w.fromSectionIds.join(", ")})\n`);
      } else {
        process.stderr.write(`    ⚠ CLAMPED cluster=${w.clusterIndex}: ${w.fields.join(", ")}\n`);
      }
    }
    process.stderr.write("ERROR: validator warnings must be 0 before applying. Rerun (possibly with a different MIN_CLUSTER_SIZE) to get a clean proposal.\n");
    process.exit(4);
  }

  // Render the merged file. Walk pooledParsed in source order; for clustered
  // sections, emit `renderMergedBlock` at the canonical (earliest-position)
  // member; drop the rest. Unclustered sections render verbatim from the
  // pooled input via their sentinel + heading + body.
  const runId = `merge-super-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const ts = new Date().toISOString();
  const sectionIdToIdx = new Map(pooledParsed.map((s, i) => [s.sectionId, i]));

  // Map cluster -> canonical sectionId (earliest position) and skip-set.
  const clusterByCanonicalId = new Map();
  const skipIds = new Set();
  for (const c of proposal.clusters) {
    let bestIdx = Infinity;
    let canonicalId = c.sectionIds[0];
    for (const sid of c.sectionIds) {
      const idx = sectionIdToIdx.get(sid);
      if (idx === undefined) continue;
      if (idx < bestIdx) { bestIdx = idx; canonicalId = sid; }
    }
    clusterByCanonicalId.set(canonicalId, c);
    for (const sid of c.sectionIds) {
      if (sid !== canonicalId) skipIds.add(sid);
    }
  }

  // For each section in pooledParsed: if it's the canonical for a cluster,
  // emit the merged block; if it's a skipped cluster member, drop; otherwise
  // emit the verbatim sentinel + heading + body. We re-emit verbatim by
  // synthesizing a fresh sentinel line + heading + body so the file is
  // structurally identical to a normal post-summarizer file (every block
  // begins with a sentinel comment).
  const blocks = [];
  for (const s of pooledParsed) {
    if (skipIds.has(s.sectionId)) continue;
    const cluster = clusterByCanonicalId.get(s.sectionId);
    if (cluster) {
      blocks.push(compactMod.renderMergedBlock(cluster, runId, ts));
    } else {
      const issueIdToken = (s.issueIds && s.issueIds.length > 1)
        ? s.issueIds.map((n) => `#${n}`).join("+")
        : `#${s.issueId ?? 0}`;
      const sentinel = `<!-- run:${s.runId ?? runId} issue:${issueIdToken} outcome:${s.outcome ?? "accepted"} ts:${ts} -->`;
      blocks.push(`${sentinel}\n## ${s.heading}\n\n${s.body}`);
    }
  }

  const preamble = `# Super-agent CLAUDE.md (pooled-lessons union)

Built by \`research/curve-redo-bundle/super-agent/build-super-agent.cjs\` on ${ts}.
Contributors: ${contributors.length} eligible agents (out of ${eligible.length} total registered).
Input bytes (raw): ${totalInputBytes}. Pooled (post-preamble-strip): ${pooledBytes}.
Compaction model output: ${proposal.clusters.length} merged clusters, ${proposal.unclusteredSectionIds.length} verbatim sections.

`;
  const rendered = preamble + blocks.join("\n\n") + "\n";
  const renderedBytes = Buffer.byteLength(rendered, "utf-8");
  const retentionPct = pooledBytes > 0 ? (renderedBytes / pooledBytes) * 100 : 0;

  process.stderr.write(`[build-super-agent] rendered super-agent CLAUDE.md: ${renderedBytes} bytes (${(renderedBytes/1024).toFixed(1)} KB)\n`);
  process.stderr.write(`[build-super-agent] retention vs pooled input: ${retentionPct.toFixed(1)}%\n`);

  if (retentionPct < 25 || retentionPct > 50) {
    process.stderr.write(`WARN: retention ${retentionPct.toFixed(1)}% outside acceptance range [25%, 50%]. Plan suggests rerun with MIN_CLUSTER_SIZE=${retentionPct < 25 ? 4 : 2}.\n`);
  }

  if (DRY_RUN) {
    process.stderr.write("[build-super-agent] DRY_RUN=1 — skipping mint + write.\n");
    return;
  }

  // Mint `agent-super` (or env-overridden ID). `ensureAgent` accepts an
  // explicit agentId; `createAgent` (the random-mint helper) does not.
  const minted = await registryMod.mutateRegistry((r) => {
    const rec = registryMod.ensureAgent(r, TARGET_AGENT_ID);
    rec.name = TARGET_AGENT_NAME;
    rec.tags = TARGET_AGENT_TAGS;
    return rec;
  });
  const claudeMdPath = specMod.agentClaudeMdPath(minted.agentId);
  fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
  fs.writeFileSync(claudeMdPath, rendered);

  process.stderr.write(`[build-super-agent] minted ${minted.agentId} (${minted.name})\n`);
  process.stderr.write(`  CLAUDE.md: ${claudeMdPath} (${renderedBytes} bytes)\n`);
  process.stdout.write(minted.agentId + "\n");

  // Persist a build manifest next to the CLAUDE.md for downstream phases.
  const manifest = {
    agentId: minted.agentId,
    builtAt: ts,
    runId,
    minClusterSize: MIN_CLUSTER_SIZE,
    contributors: perAgentSections,
    contributorCount: contributors.length,
    eligibleCount: eligible.length,
    inputBytesRaw: totalInputBytes,
    pooledBytes,
    pooledSectionCount: pooledParsed.length,
    proposal: {
      clusterCount: proposal.clusters.length,
      unclusteredCount: proposal.unclusteredSectionIds.length,
      estimatedBytesSaved: proposal.estimatedBytesSaved,
      warningCount: proposal.warnings.length,
      notes: proposal.notes,
    },
    renderedBytes,
    retentionPct,
  };
  const manifestPath = path.join(path.dirname(claudeMdPath), "super-agent-build-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  process.stderr.write(`  manifest: ${manifestPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
