#!/usr/bin/env node
// Super-agent random-trim sweep (Phase B of feature-plans/super-agent-curve-experiment-plan.md):
// generate 12 sizes × 3 seeds = 36 trim agents from `agent-super`, mint each
// in the registry, write the trim CLAUDE.md, group into 6 legs, emit legs.json.
//
// Steps:
//   1. Load `agents/agent-super/CLAUDE.md`. S = its byte size.
//   2. Build the geometric size grid `[0, S/512, S/256, ..., S/4, S/2, 3S/4, S]`
//      rounded to whole KB. (Plan size grid; auto-rescales if S diverges from
//      ~400 KB — Phase A retention can land below that.)
//   3. Drive `planRandomTrims({ parent, sizes, replicates: 3, seedBase: 19 })`
//      via dist/src/research/curveStudy/randomTrim.js. The Mulberry32 PRNG
//      makes seed = seedBase + size + (k * 1000003) deterministic — re-runs
//      reproduce byte-identical trims (verification path).
//   4. For each TrimPlan, mint `agent-super-trim-<sizeBytes>-s<seed>` via
//      `mutateRegistry` + `ensureAgent` (explicit ID), set name + tags
//      directly on the record, and write the trim text to
//      `agents/<agentId>/CLAUDE.md`.
//   5. Pre-create per-agent target-repo clones at
//      `/tmp/study-clones/<agentId>-<repoBasename>` for each repo present in
//      the corpus. Skipping clones the dispatch loop would create on its own
//      eats wall-time × parallelism — pre-creating once amortizes it.
//   6. Group trims into 6 legs of 6 trims each by sorting on (sizeBytes, seed)
//      and chunking sequentially. Adjacent-size trims cluster in the same leg
//      so per-leg quick-look already shows local curve shape. Write
//      `research/curve-redo-data/super-agent/legs.json`.
//
// Idempotency: re-running with the same inputs writes byte-identical trims
// AND `ensureAgent` no-ops on existing IDs. Re-running with a different
// SEED_BASE *will* mint additional agents (the agentId encodes the seed).
//
// Usage:
//   npm run build && node research/curve-redo-bundle/super-agent/build-super-trims.cjs
//
// Env overrides:
//   SUPER_AGENT_ID    parent agent (default "agent-super")
//   SEED_BASE         seedBase for planRandomTrims (default 19)
//   REPLICATES        replicates per size (default 3)
//   LEG_COUNT         number of legs (default 6)
//   SKIP_CLONES       "1" → skip the prepare-scratch-clones step (smoke-test path)
//   DRY_RUN           "1" → plan + render but skip mint + write

"use strict";

const path = require("node:path");
const fs = require("node:fs");
const child_process = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DIST = path.join(REPO_ROOT, "dist", "src");
const AGENTS_DIR = path.join(REPO_ROOT, "agents");
const CORPUS_PATH = path.join(REPO_ROOT, "research", "curve-redo-bundle", "corpus.json");
const OUT_DIR = path.join(REPO_ROOT, "research", "curve-redo-data", "super-agent");
const LEGS_PATH = path.join(OUT_DIR, "legs.json");

const SUPER_AGENT_ID = process.env.SUPER_AGENT_ID || "agent-super";
const SEED_BASE = Number(process.env.SEED_BASE || 19);
const REPLICATES = Number(process.env.REPLICATES || 3);
const LEG_COUNT = Number(process.env.LEG_COUNT || 6);
const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_CLONES = process.env.SKIP_CLONES === "1";

function requireDist(rel) {
  const p = path.join(DIST, rel);
  if (!fs.existsSync(p)) {
    process.stderr.write(`ERROR: ${p} missing — run \`npm run build\` first.\n`);
    process.exit(1);
  }
  return require(p);
}

// Geometric grid `[0, S/512, S/256, S/128, S/64, S/32, S/16, S/8, S/4, S/2, 3S/4, S]`,
// each entry rounded to the nearest BYTE (not KB). Plan rendered the grid in
// KB for readability, but KB-rounding collapses the bottom octave when S is
// modest: at S=137 KB the bottom three fractions all rounded to {0, 1, 1} KB,
// dropping the trim count from 36 to 30 and leaving poly3 with too little
// resolution at the small-x end. Byte rounding keeps every fraction distinct
// for any S ≥ 512 (each fraction differs by ≥1 byte).
function buildSizeGrid(S) {
  const fractions = [0, 1/512, 1/256, 1/128, 1/64, 1/32, 1/16, 1/8, 1/4, 1/2, 3/4, 1];
  const sizes = [];
  for (const f of fractions) {
    const bytes = Math.round(f * S);
    if (!sizes.includes(bytes)) sizes.push(bytes);
  }
  return sizes;
}

function repoBasenames(corpus) {
  const set = new Set();
  for (const i of corpus.issues) {
    set.add(i.repo.split("/")[1]);
  }
  return Array.from(set).sort();
}

function clonePathFor(agentId, repoBasename) {
  return `/tmp/study-clones/${agentId}-${repoBasename}`;
}

function clonePathsForRepo(repoBasename) {
  // Try the operator's local clone first; fall back to gh repo source for the
  // initial clone. Mirrors `clone_path_for_repo` in dispatch-specialist-redo.sh.
  const home = process.env.HOME || "/home";
  for (const c of [`${home}/dev/${repoBasename}`, `${home}/dev/vaultpilot/${repoBasename}`]) {
    if (fs.existsSync(path.join(c, ".git"))) return c;
  }
  return null;
}

async function prepareScratchClones(agents, repos) {
  // Pre-create one scratch clone per (agent, repo) under /tmp/study-clones/.
  // Each clone is a `git clone --no-local <source> <dest>` from the operator's
  // existing local clone (read-only source — never edited). If any clone
  // already exists with a `.git/`, leave it alone. Pure plumbing, idempotent.
  const targetRoot = "/tmp/study-clones";
  fs.mkdirSync(targetRoot, { recursive: true });
  let created = 0, existing = 0, failed = 0;
  for (const repoBase of repos) {
    const source = clonePathsForRepo(repoBase);
    if (!source) {
      process.stderr.write(`WARN: no source clone for ${repoBase} at $HOME/dev/{,vaultpilot/}${repoBase} — skipping.\n`);
      failed += agents.length;
      continue;
    }
    for (const agentId of agents) {
      const dest = clonePathFor(agentId, repoBase);
      if (fs.existsSync(path.join(dest, ".git"))) {
        existing++;
        continue;
      }
      // Use --no-local because `--local` shares object stores via hardlinks;
      // each agent worktree will mutate refs / staging which can race across
      // hardlinked clones. --no-local copies, costing ~5x disk for safety.
      const rc = child_process.spawnSync(
        "git",
        ["clone", "--no-local", "--quiet", source, dest],
        { stdio: ["ignore", "ignore", "inherit"] },
      ).status;
      if (rc !== 0) { failed++; continue; }
      created++;
    }
  }
  process.stderr.write(`[build-super-trims] clones: created=${created} already=${existing} failed=${failed}\n`);
  if (failed > 0) {
    process.stderr.write("WARN: some clones failed; the dispatch loop will fall back to its own clone path.\n");
  }
}

async function main() {
  const registryMod = requireDist(path.join("state", "registry.js"));
  const specMod = requireDist(path.join("agent", "specialization.js"));
  const trimMod = requireDist(path.join("research", "curveStudy", "randomTrim.js"));

  const parentPath = specMod.agentClaudeMdPath(SUPER_AGENT_ID);
  if (!fs.existsSync(parentPath)) {
    process.stderr.write(`ERROR: parent CLAUDE.md missing at ${parentPath}. Run build-super-agent.cjs first.\n`);
    process.exit(2);
  }
  const parent = fs.readFileSync(parentPath, "utf-8");
  const S = Buffer.byteLength(parent, "utf-8");

  const sizes = buildSizeGrid(S);
  process.stderr.write(`[build-super-trims] parent=${SUPER_AGENT_ID} S=${S} bytes (${(S/1024).toFixed(1)} KB)\n`);
  process.stderr.write(`[build-super-trims] size grid (bytes): ${sizes.join(", ")}\n`);
  process.stderr.write(`[build-super-trims] replicates=${REPLICATES} seedBase=${SEED_BASE} → ${sizes.length * REPLICATES} trims\n`);

  const plans = trimMod.planRandomTrims({
    parent,
    sizes,
    replicates: REPLICATES,
    seedBase: SEED_BASE,
  });

  // Each plan → agentId + clone paths + trim CLAUDE.md content.
  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf-8"));
  const repos = repoBasenames(corpus);

  const trims = plans.map((plan) => {
    const agentId = `${SUPER_AGENT_ID}-trim-${plan.size}-s${plan.seed}`;
    return {
      agentId,
      sizeBytes: plan.size,
      actualBytes: plan.result.actualBytes,
      seed: plan.seed,
      selectedIds: plan.result.selectedIds,
      droppedIds: plan.result.droppedIds,
      content: plan.result.trimmed,
      clones: Object.fromEntries(repos.map((r) => [r, clonePathFor(agentId, r)])),
    };
  });

  // Sort by (sizeBytes, seed) and chunk sequentially into LEG_COUNT legs.
  // Cells per leg = ceil(N / LEG_COUNT); the last leg may be smaller if
  // sizes×replicates doesn't divide evenly.
  const sorted = [...trims].sort((a, b) => a.sizeBytes - b.sizeBytes || a.seed - b.seed);
  const perLeg = Math.ceil(sorted.length / LEG_COUNT);
  const legs = [];
  for (let i = 0; i < LEG_COUNT; i++) {
    const slice = sorted.slice(i * perLeg, (i + 1) * perLeg);
    if (slice.length === 0) continue;
    legs.push({
      legNumber: i + 1,
      trimAgentIds: slice.map((t) => t.agentId),
    });
  }

  // Render `legs.json` shape: top-level `parent` + `repos` + `corpus` for
  // dispatch-super-leg.sh, plus per-trim metadata so the dispatch script can
  // resolve clone paths without re-deriving them.
  const legsJson = {
    builtAt: new Date().toISOString(),
    parent: SUPER_AGENT_ID,
    seedBase: SEED_BASE,
    replicates: REPLICATES,
    legCount: legs.length,
    perLeg,
    repos,
    parentBytes: S,
    sizesBytes: sizes,
    corpusPath: path.relative(REPO_ROOT, CORPUS_PATH),
    trims: trims.map((t) => ({
      agentId: t.agentId,
      sizeBytes: t.sizeBytes,
      actualBytes: t.actualBytes,
      seed: t.seed,
      sectionCounts: { selected: t.selectedIds.length, dropped: t.droppedIds.length },
      clones: t.clones,
    })),
    legs,
  };

  if (DRY_RUN) {
    process.stderr.write("[build-super-trims] DRY_RUN=1 — skipping mint, write, clones.\n");
    process.stdout.write(JSON.stringify(legsJson, null, 2) + "\n");
    return;
  }

  // Mint each trim agent and write its CLAUDE.md.
  let minted = 0, already = 0, written = 0;
  await registryMod.mutateRegistry((reg) => {
    for (const t of trims) {
      const before = reg.agents.find((a) => a.agentId === t.agentId);
      const rec = registryMod.ensureAgent(reg, t.agentId);
      rec.tags = ["super-agent-trim", `size-${t.sizeBytes}`, `seed-${t.seed}`];
      if (before) already++; else minted++;
    }
  });
  for (const t of trims) {
    const claudeMdPath = specMod.agentClaudeMdPath(t.agentId);
    fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
    fs.writeFileSync(claudeMdPath, t.content);
    written++;
  }
  process.stderr.write(`[build-super-trims] minted=${minted} already=${already} CLAUDE.md written=${written}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LEGS_PATH, JSON.stringify(legsJson, null, 2));
  process.stderr.write(`[build-super-trims] wrote ${LEGS_PATH}\n`);

  // Trim summary table.
  for (const leg of legs) {
    const agents = leg.trimAgentIds.map((id) => trims.find((t) => t.agentId === id));
    const sizes = agents.map((t) => t.sizeBytes).sort((a, b) => a - b);
    process.stderr.write(`  leg ${leg.legNumber}: ${agents.length} trims; sizes=[${sizes.join(", ")}]\n`);
  }

  if (!SKIP_CLONES) {
    await prepareScratchClones(trims.map((t) => t.agentId), repos);
  } else {
    process.stderr.write("[build-super-trims] SKIP_CLONES=1 — operator must pre-create clones before dispatch.\n");
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
