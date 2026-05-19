#!/usr/bin/env node
// n=19 4-arm aggregator — merges per-cell judges + v2-rescored tests + log
// envelopes across {tailored, prose, trim, specialist} arms; computes
// per-issue means and pairwise paired Wilcoxon + bootstrap. Self-contained:
// no dependency on dist/ — pulls the Wilcoxon primitive inline.
//
// Sources are hardcoded to the on-disk worktree layout (see PR body).
// Output: research/curve-redo-data/v2-scoring/comparison-n19-4arm.json

const fs = require("node:fs");
const path = require("node:path");

// -------------------------------------------------------------------------
// Inputs
// -------------------------------------------------------------------------

const WT_ROOT = "/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees";

const SOURCES = {
  tailored: {
    arm: "tailored",
    // logs + judges
    legs: [
      // old 13
      { logs: "/tmp/n19-inputs/super-agent-tailored/logs-leg1", judges: "/tmp/n19-inputs/super-agent-tailored/scores-leg1" },
      { logs: "/tmp/n19-inputs/super-agent-tailored/logs-leg2", judges: "/tmp/n19-inputs/super-agent-tailored/scores-leg2" },
      // new 6
      { logs: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-tailored/logs-leg1`, judges: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-tailored/scores-leg1` },
      { logs: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-tailored/logs-leg2`, judges: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-tailored/scores-leg2` },
    ],
    // v2 B scores (prefer *-tests-v2.json; fall back to *-baseline.json)
    v2Dir: `${WT_ROOT}/adapt-tailored/research/curve-redo-data/v2-scoring/tailored`,
    v2Suffixes: ["-tests-v2.json", "-baseline.json"],
  },
  prose: {
    arm: "prose",
    legs: [
      { logs: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose-old13/logs-leg1`, judges: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose-old13/scores-leg1` },
      { logs: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose-old13/logs-leg2`, judges: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose-old13/scores-leg2` },
      { logs: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose/logs-leg1`, judges: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose/scores-leg1` },
      { logs: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose/logs-leg2`, judges: `${WT_ROOT}/n19-experiment/research/curve-redo-data/n19-prose/scores-leg2` },
    ],
    v2Dir: `${WT_ROOT}/n19-experiment/research/curve-redo-data/v2-scoring/prose`,
    v2Suffixes: ["-tests-v2.json"],
  },
  trim: {
    arm: "trim",
    legs: [
      // new 6 only — trim has no usable old 13 v2 rescore
      { logs: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/trim/logs-leg1`, judges: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/trim/scores-leg1` },
      { logs: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/trim/logs-leg2`, judges: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/trim/scores-leg2` },
    ],
    v2Dir: `${WT_ROOT}/rescore-trim/research/curve-redo-data/v2-scoring/trim`,
    v2Suffixes: ["-tests-v2.json"],
  },
  specialist: {
    arm: "specialist",
    legs: [
      { logs: "/tmp/spec-old13/specialist-redo/logs-leg1", judges: "/tmp/spec-old13/specialist-redo/scores-leg1" },
      { logs: "/tmp/spec-old13/specialist-redo/logs-leg2", judges: "/tmp/spec-old13/specialist-redo/scores-leg2" },
      { logs: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/specialist/logs-leg1`, judges: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/specialist/scores-leg1` },
      { logs: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/specialist/logs-leg2`, judges: `${WT_ROOT}/trim-specialist-new6/research/curve-redo-data/new6/specialist/scores-leg2` },
    ],
    v2Dir: `${WT_ROOT}/rescore-specialist/research/curve-redo-data/v2-scoring/specialist`,
    v2Suffixes: ["-tests-v2.json"],
  },
};

const OUTPUT = `${WT_ROOT}/n19-experiment/research/curve-redo-data/v2-scoring/comparison-n19-4arm.json`;

const ISSUE_IDS = [156, 157, 162, 168, 172, 173, 178, 180, 185, 186, 251, 253, 565, 574, 626, 649, 665, 667, 669];
const NEW_6 = new Set([173, 251, 253, 626, 667, 669]);

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const meanOf = (xs) => xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);

function stdOf(xs) {
  if (xs.length < 2) return null;
  const m = meanOf(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}

// Parse the trailing JSON envelope in a bench .log file (last "{\n…}").
function readLogEnvelope(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const txt = fs.readFileSync(logPath, "utf8");
  // Find the last "{\n" that begins a top-level JSON block.
  const idx = txt.lastIndexOf("\n{\n");
  if (idx < 0) return null;
  const body = txt.slice(idx + 1);
  try {
    const j = JSON.parse(body);
    return {
      decision: j.envelope?.decision ?? (j.isError ? "error" : null),
      costUsd: j.costUsd ?? 0,
      isError: j.isError === true,
      errorReason: j.errorReason ?? null,
    };
  } catch {
    return null;
  }
}

// Parse cell key from a bench log filename, e.g.
//   bench-r1-agent-super-tailored-565-565.log → { rep: 1, agent: "super-tailored", issueId: 565 }
//   bench-r1-agent-02ce-565.log → { rep: 1, agent: "02ce", issueId: 565 }
//   bench-r1-agent-916a-trim-22000-s2024032-253.log → { rep: 1, agent: "916a-trim-22000-s2024032", issueId: 253 }
const BENCH_LOG_RE = /^bench-r(\d+)-agent-(.+)-(\d+)(?:-(\d+))?\.log$/;
function parseBenchLogName(name) {
  const m = BENCH_LOG_RE.exec(name);
  if (!m) return null;
  const rep = Number(m[1]);
  // tailored format duplicates the issue id: bench-r1-agent-super-tailored-565-565.log
  // → m[2] = "super-tailored-565", m[3] = "565", m[4] = undefined? Actually with the new RE m[4] catches the trailing dup.
  // The original RE was: bench-r1-agent-X-Y-Y where the second Y is the dup. Let me just strip a trailing "-<digits>" from m[2] if m[3] equals it OR if m[4] is defined.
  let agent = m[2];
  let issueId;
  if (m[4] !== undefined) {
    // form: bench-r1-agent-<agent>-<issue>-<issue>
    issueId = Number(m[3]);
    if (Number(m[4]) === issueId) {
      // ok, dup form: agent is m[2], issueId is m[3], skipped trailing m[4]
    } else {
      issueId = Number(m[4]);
      agent = `${m[2]}-${m[3]}`;
    }
  } else {
    issueId = Number(m[3]);
  }
  return { rep, agent, issueId };
}

// Read judge.json — returns A ∈ [0,50] or null if isError.
function readJudge(judgePath) {
  if (!fs.existsSync(judgePath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(judgePath, "utf8"));
    if (j.isError === true) return null;
    if (typeof j.median !== "number") return null;
    return clamp(j.median, 0, 50);
  } catch {
    return null;
  }
}

// Read v2 tests json — returns { B, applyCleanly, passed, total } or null.
function readV2Tests(testsPath) {
  if (!fs.existsSync(testsPath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(testsPath, "utf8"));
    const apply = j.applyCleanly === true;
    const total = Number(j.total) || 0;
    const passed = Number(j.passed) || 0;
    if (!apply || total <= 0) return { B: null, applyCleanly: apply, passed, total };
    return { B: clamp((passed / total) * 50, 0, 50), applyCleanly: apply, passed, total };
  } catch {
    return null;
  }
}

// Locate v2-rescored B for a (arm, agent, issueId, rep) tuple. The v2 dirs
// drop the duplicate issue ID for tailored (-180-180 → -180). They also use
// different agent IDs across arms. Match by suffix `<agent>-<issue>` then
// fall back to any cell with the same `r<rep>-…-<issue>` pattern.
function findV2Tests(spec, agent, issueId, rep) {
  const dir = spec.v2Dir;
  if (!fs.existsSync(dir)) return null;
  // candidate stems (with and without doubled issue id):
  const stems = [
    `bench-r${rep}-agent-${agent}-${issueId}-${issueId}`,
    `bench-r${rep}-agent-${agent}-${issueId}`,
  ];
  for (const stem of stems) {
    for (const suffix of spec.v2Suffixes) {
      const p = path.join(dir, stem + suffix);
      if (fs.existsSync(p)) return { path: p, ...readV2Tests(p) };
    }
  }
  // Fallback: match any file in v2Dir ending with `-<issueId>` (with optional -<issueId>)
  // and starting with `bench-r<rep>-agent-` — useful when agent IDs differ slightly.
  const all = fs.readdirSync(dir);
  for (const f of all) {
    if (!f.startsWith(`bench-r${rep}-agent-`)) continue;
    for (const suffix of spec.v2Suffixes) {
      if (!f.endsWith(suffix)) continue;
      // Allow either `…-<issue>-<issue><suffix>` or `…-<issue><suffix>`
      const stem = f.slice(0, -suffix.length);
      if (stem.endsWith(`-${issueId}-${issueId}`) || stem.endsWith(`-${issueId}`)) {
        const p = path.join(dir, f);
        return { path: p, ...readV2Tests(p) };
      }
    }
  }
  return null;
}

// Find v1 tests (original, non-v2) — for delta analysis. Same scoring dirs.
function findV1Tests(legs, agent, issueId, rep) {
  const stems = [
    `bench-r${rep}-agent-${agent}-${issueId}-${issueId}`,
    `bench-r${rep}-agent-${agent}-${issueId}`,
  ];
  for (const leg of legs) {
    if (!fs.existsSync(leg.judges)) continue;
    for (const stem of stems) {
      const p = path.join(leg.judges, stem + "-tests.json");
      if (fs.existsSync(p)) return readV2Tests(p); // shape is identical
    }
    // Fallback search
    const all = fs.readdirSync(leg.judges);
    for (const f of all) {
      if (!f.startsWith(`bench-r${rep}-agent-`) || !f.endsWith("-tests.json")) continue;
      const stem = f.slice(0, -"-tests.json".length);
      if (stem.endsWith(`-${issueId}-${issueId}`) || stem.endsWith(`-${issueId}`)) {
        return readV2Tests(path.join(leg.judges, f));
      }
    }
  }
  return null;
}

// Build per-cell records for one arm.
function loadArmCells(spec) {
  const cells = [];
  for (const leg of spec.legs) {
    if (!fs.existsSync(leg.logs)) continue;
    for (const fname of fs.readdirSync(leg.logs).sort()) {
      if (!fname.endsWith(".log")) continue;
      const parsed = parseBenchLogName(fname);
      if (!parsed) continue;
      const { rep, agent, issueId } = parsed;
      const logPath = path.join(leg.logs, fname);
      const env = readLogEnvelope(logPath);
      // Judge: try the corresponding judges dir.
      // Cell key: bench-r<rep>-agent-<agent>-<issueId>[-<issueId>]-judge.json
      let A = null;
      let judgePath = null;
      const judgeStems = [
        `bench-r${rep}-agent-${agent}-${issueId}-${issueId}`,
        `bench-r${rep}-agent-${agent}-${issueId}`,
      ];
      for (const stem of judgeStems) {
        const p = path.join(leg.judges, stem + "-judge.json");
        if (fs.existsSync(p)) { judgePath = p; A = readJudge(p); break; }
      }
      // v2 B
      const v2 = findV2Tests(spec, agent, issueId, rep);
      const v1 = findV1Tests(spec.legs, agent, issueId, rep);
      const B = v2?.B ?? null;
      // Combined Q
      let combinedQ;
      const dec = env?.decision;
      if (dec === "pushback") {
        combinedQ = A == null ? 0 : 2 * A;
      } else if (dec == null || dec === "error" || dec === "error_max_turns") {
        combinedQ = 0;
      } else { // implement
        combinedQ = (A == null || B == null) ? 0 : A + B;
      }
      cells.push({
        arm: spec.arm,
        agent,
        rep,
        issueId,
        decision: dec ?? null,
        costUsd: env?.costUsd ?? 0,
        A, B,
        applyCleanly: v2?.applyCleanly ?? null,
        passed: v2?.passed ?? null,
        total: v2?.total ?? null,
        v1B: v1?.B ?? null,
        v1Apply: v1?.applyCleanly ?? null,
        combinedQ,
        logPath,
        judgePath,
        v2Path: v2?.path ?? null,
      });
    }
  }
  return cells;
}

// Group cells by issue, computing per-issue means for one arm.
function perIssue(cells) {
  const byIssue = new Map();
  for (const c of cells) {
    if (!byIssue.has(c.issueId)) byIssue.set(c.issueId, []);
    byIssue.get(c.issueId).push(c);
  }
  const out = new Map();
  for (const [id, list] of byIssue.entries()) {
    const As = list.map((c) => c.A).filter((x) => x != null);
    const Bs = list.filter((c) => c.decision === "implement").map((c) => c.B).filter((x) => x != null);
    const Qs = list.map((c) => c.combinedQ);
    const Cs = list.map((c) => c.costUsd);
    out.set(id, {
      issueId: id,
      cells: list.length,
      meanA: meanOf(As),
      meanB: meanOf(Bs),
      meanQ: meanOf(Qs),
      meanCost: meanOf(Cs),
      replicates: list.map((c) => ({ rep: c.rep, decision: c.decision, A: c.A, B: c.B, Q: c.combinedQ, cost: c.costUsd, agent: c.agent })),
    });
  }
  return out;
}

// -------------------------------------------------------------------------
// Stats: Wilcoxon signed-rank paired, two-sided + bootstrap CI.
// -------------------------------------------------------------------------

function standardNormalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absZ);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-absZ * absZ);
  return 0.5 * (1 + sign * y);
}

// Wilcoxon signed-rank paired, returning {n, wPlus, wMinus, z, pOneSided[two-sided=2*min(p_less, p_greater) capped at 1], pTwoSided}
function wilcoxonPaired(differences) {
  const nonZero = differences.filter((d) => d !== 0);
  const n = nonZero.length;
  if (n === 0) return { n: 0, wPlus: 0, wMinus: 0, z: 0, pTwoSided: 1, pGreater: 1, pLess: 1 };
  const indexed = nonZero.map((d) => ({ abs: Math.abs(d), sign: d > 0 ? 1 : -1 }));
  indexed.sort((a, b) => a.abs - b.abs);
  const ranks = new Array(n);
  const tieGroupSizes = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].abs === indexed[i].abs) j++;
    const gs = j - i + 1;
    if (gs > 1) tieGroupSizes.push(gs);
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let wPlus = 0, wMinus = 0;
  for (let k = 0; k < n; k++) {
    if (indexed[k].sign > 0) wPlus += ranks[k]; else wMinus += ranks[k];
  }
  const mean = (n * (n + 1)) / 4;
  const tieCorr = tieGroupSizes.reduce((s, t) => s + (t * t * t - t), 0) / 48;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorr;
  if (variance <= 0) return { n, wPlus, wMinus, z: 0, pTwoSided: 1, pGreater: 1, pLess: 1 };
  const stdev = Math.sqrt(variance);
  // For "greater" (wPlus should be LARGE → positive z), lower continuity correction.
  const zGreater = (wPlus - mean - 0.5) / stdev;
  const zLess = (wPlus - mean + 0.5) / stdev;
  const pGreater = 1 - standardNormalCdf(zGreater);
  const pLess = standardNormalCdf(zLess);
  const pTwoSided = Math.min(1, 2 * Math.min(pGreater, pLess));
  return { n, wPlus, wMinus, z: (wPlus - mean) / stdev, pTwoSided, pGreater, pLess };
}

function bootstrap(xs, B = 10000, seed = 0x12345678) {
  if (xs.length === 0) return { mean: null, ci95: [null, null], pPos: null, pNeg: null };
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stats = new Array(B);
  const n = xs.length;
  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += xs[Math.floor(rand() * n)];
    stats[b] = sum / n;
  }
  stats.sort((a, b) => a - b);
  return {
    mean: stats.reduce((a, b) => a + b, 0) / B,
    ci95: [stats[Math.floor(0.025 * B)], stats[Math.floor(0.975 * B)]],
    pPos: stats.filter((s) => s > 0).length / B,
    pNeg: stats.filter((s) => s < 0).length / B,
  };
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

function main() {
  const armCells = {};
  const armByIssue = {};
  for (const spec of Object.values(SOURCES)) {
    const cells = loadArmCells(spec);
    armCells[spec.arm] = cells;
    armByIssue[spec.arm] = perIssue(cells);
    process.stderr.write(`Loaded ${cells.length} cells for arm=${spec.arm}\n`);
  }

  // Per-arm absolute distributions across all issues with data.
  const armDistributions = {};
  for (const [arm, byIssue] of Object.entries(armByIssue)) {
    const issues = [...byIssue.values()];
    const meanQs = issues.map((p) => p.meanQ).filter((x) => x != null);
    const meanCosts = issues.map((p) => p.meanCost).filter((x) => x != null);
    const meanAs = issues.map((p) => p.meanA).filter((x) => x != null);
    const meanBs = issues.map((p) => p.meanB).filter((x) => x != null);
    armDistributions[arm] = {
      nIssues: issues.length,
      issueIds: issues.map((p) => p.issueId).sort((a, b) => a - b),
      meanA: { mean: meanOf(meanAs), std: stdOf(meanAs), n: meanAs.length },
      meanB: { mean: meanOf(meanBs), std: stdOf(meanBs), n: meanBs.length },
      meanQ: { mean: meanOf(meanQs), std: stdOf(meanQs), n: meanQs.length, bootstrap: bootstrap(meanQs) },
      meanCost: { mean: meanOf(meanCosts), std: stdOf(meanCosts), n: meanCosts.length, bootstrap: bootstrap(meanCosts) },
      totalCells: armCells[arm].length,
    };
  }

  // Per-issue table, all arms side by side.
  const perIssueTable = [];
  for (const id of ISSUE_IDS) {
    const row = { issueId: id, isNew6: NEW_6.has(id) };
    for (const arm of Object.keys(SOURCES)) {
      const rec = armByIssue[arm].get(id);
      row[arm] = rec ? { meanA: rec.meanA, meanB: rec.meanB, meanQ: rec.meanQ, meanCost: rec.meanCost, cells: rec.cells } : null;
    }
    perIssueTable.push(row);
  }

  // Pairwise paired Wilcoxon + bootstrap. For each (A, B) pair, collect
  // issues where BOTH arms have a per-issue meanQ; compute d = A - B.
  // Report Q and cost. Also A and B (judge-A axis, tests-B axis) where both
  // arms have an A / B value.
  function pairedAxis(armA, armB, getField) {
    const aMap = armByIssue[armA];
    const bMap = armByIssue[armB];
    const pairs = [];
    for (const id of ISSUE_IDS) {
      const a = aMap.get(id);
      const b = bMap.get(id);
      if (!a || !b) continue;
      const av = getField(a);
      const bv = getField(b);
      if (av == null || bv == null) continue;
      pairs.push({ issueId: id, av, bv, d: av - bv });
    }
    return pairs;
  }
  function runTest(armA, armB, axis, lessIsBetter = false) {
    const getter = { A: (r) => r.meanA, B: (r) => r.meanB, Q: (r) => r.meanQ, cost: (r) => r.meanCost }[axis];
    const pairs = pairedAxis(armA, armB, getter);
    const ds = pairs.map((p) => p.d);
    const w = wilcoxonPaired(ds);
    const boot = bootstrap(ds);
    return {
      armA, armB, axis,
      nPairs: pairs.length,
      meanA: meanOf(pairs.map((p) => p.av)),
      meanB: meanOf(pairs.map((p) => p.bv)),
      meanDiff: meanOf(ds),
      wilcoxon: w,
      bootstrap: boot,
      lessIsBetter,
      pairs,
    };
  }

  const arms = ["tailored", "prose", "specialist", "trim"];
  const pairwise = [];
  for (let i = 0; i < arms.length; i++) {
    for (let j = i + 1; j < arms.length; j++) {
      for (const axis of ["A", "B", "Q", "cost"]) {
        pairwise.push(runTest(arms[i], arms[j], axis, axis === "cost"));
      }
    }
  }

  // V2 vs V1 delta for cells that have both.
  const v2vsV1 = {};
  for (const [arm, cells] of Object.entries(armCells)) {
    const withBoth = cells.filter((c) => c.B != null && c.v1B != null);
    const withV2Only = cells.filter((c) => c.B != null && c.v1B == null);
    const rescued = cells.filter((c) => c.v1Apply === false && c.applyCleanly === true && c.B != null && c.B > 0);
    const regressed = cells.filter((c) => c.v1B != null && c.B != null && c.B < c.v1B - 0.5);
    const improved = cells.filter((c) => c.v1B != null && c.B != null && c.B > c.v1B + 0.5);
    v2vsV1[arm] = {
      totalCells: cells.length,
      cellsWithV1: cells.filter((c) => c.v1B != null || c.v1Apply != null).length,
      cellsWithV2: cells.filter((c) => c.B != null || c.applyCleanly != null).length,
      cellsWithBoth: withBoth.length,
      cellsRescuedFromFalseZero: rescued.length,
      cellsImproved: improved.length,
      cellsRegressed: regressed.length,
      rescuedDetail: rescued.map((c) => ({ rep: c.rep, issueId: c.issueId, agent: c.agent, v1B: c.v1B, v2B: c.B })),
      improvedDetail: improved.slice(0, 10).map((c) => ({ rep: c.rep, issueId: c.issueId, agent: c.agent, v1B: c.v1B, v2B: c.B, delta: c.B - c.v1B })),
      regressedDetail: regressed.slice(0, 10).map((c) => ({ rep: c.rep, issueId: c.issueId, agent: c.agent, v1B: c.v1B, v2B: c.B, delta: c.B - c.v1B })),
    };
  }

  const out = {
    generatedAt: new Date().toISOString(),
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { legs: v.legs.length, v2Dir: v.v2Dir, v2Suffixes: v.v2Suffixes }])),
    issueCorpus: { all: ISSUE_IDS, new6: [...NEW_6].sort((a, b) => a - b) },
    armDistributions,
    perIssueTable,
    pairwise,
    v2vsV1,
    rawCellCounts: Object.fromEntries(Object.entries(armCells).map(([arm, cells]) => [arm, cells.length])),
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n");

  // Console summary
  const fmt = (x, d = 2) => (x == null || !Number.isFinite(x)) ? "n/a" : x.toFixed(d);
  process.stdout.write("\n=== Per-arm absolute distributions ===\n");
  process.stdout.write("arm\tnIssues\ttotalCells\tmeanA\tmeanB\tmeanQ (95% CI)\tmeanCost (95% CI)\n");
  for (const [arm, d] of Object.entries(armDistributions)) {
    process.stdout.write(`${arm}\t${d.nIssues}\t${d.totalCells}\t${fmt(d.meanA.mean)}\t${fmt(d.meanB.mean)}\t${fmt(d.meanQ.mean)} [${fmt(d.meanQ.bootstrap.ci95[0])}, ${fmt(d.meanQ.bootstrap.ci95[1])}]\t$${fmt(d.meanCost.mean, 3)} [${fmt(d.meanCost.bootstrap.ci95[0], 3)}, ${fmt(d.meanCost.bootstrap.ci95[1], 3)}]\n`);
  }

  process.stdout.write("\n=== Pairwise paired tests (Wilcoxon two-sided + bootstrap) ===\n");
  process.stdout.write("armA\tarmB\taxis\tn\tmeanA\tmeanB\tdiff\tpTwoSided\tCI95\n");
  for (const t of pairwise) {
    const dir = t.lessIsBetter ? "less" : "greater";
    process.stdout.write(`${t.armA}\t${t.armB}\t${t.axis}\t${t.nPairs}\t${fmt(t.meanA)}\t${fmt(t.meanB)}\t${fmt(t.meanDiff)}\t${fmt(t.wilcoxon.pTwoSided, 5)}\t[${fmt(t.bootstrap.ci95?.[0] ?? null, 3)}, ${fmt(t.bootstrap.ci95?.[1] ?? null, 3)}]\n`);
  }

  process.stdout.write("\n=== V2 vs V1 ===\n");
  for (const [arm, d] of Object.entries(v2vsV1)) {
    process.stdout.write(`${arm}: total=${d.totalCells}, v1=${d.cellsWithV1}, v2=${d.cellsWithV2}, both=${d.cellsWithBoth}, rescued=${d.cellsRescuedFromFalseZero}, improved=${d.cellsImproved}, regressed=${d.cellsRegressed}\n`);
  }

  process.stdout.write(`\nWritten to ${OUTPUT}\n`);
}

main();
