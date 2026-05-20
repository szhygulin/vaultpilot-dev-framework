#!/usr/bin/env node
// v9 aggregator: complex7 with Phase C re-dispatch of pushback cells.
// For each original pushback cell, replace its scoring with the force-implement
// re-dispatch's (judge + tests-v8). Other cells keep v6 scoring.
// Trim arm uses random-K=3 subsampling.

const fs = require("node:fs");
const path = require("node:path");

const WT = "/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees";
const PHASE_C = "/tmp/phase-c-redispatch";
const ISSUE_IDS = [86, 100, 119, 308, 325, 460];

const ARM_DIRS = {
  tailored: "tailored-complex7",
  prose: "prose-complex7",
  trim: "trim-complex7",
  generalist: "generalist-complex7",
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const meanOf = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function readJudge(p) {
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) return null;
  const j = readJSON(p);
  if (!j || j.isError === true || typeof j.median !== "number") return null;
  return clamp(j.median, 0, 50);
}
function readTests(p) {
  if (!fs.existsSync(p)) return null;
  const j = readJSON(p);
  if (!j) return null;
  const apply = j.applyCleanly === true;
  const total = Number(j.total) || 0;
  const passed = Number(j.passed) || 0;
  if (!apply || total <= 0) return { B: null, applyCleanly: apply, passed, total };
  return { B: clamp((passed / total) * 50, 0, 50), applyCleanly: apply, passed, total };
}

function readLogEnvelope(p) {
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, "utf8");
  const idx = txt.lastIndexOf("\n{\n");
  if (idx < 0) return null;
  try {
    const j = JSON.parse(txt.slice(idx + 1));
    return { decision: j.envelope?.decision ?? (j.isError ? "error" : null) };
  } catch { return null; }
}

const BENCH_RE = /^bench-r(\d+)-agent-(.+?)-(\d+)(?:-(\d+))?$/;
function parseCellKey(stem) {
  const m = BENCH_RE.exec(stem);
  if (!m) return null;
  const rep = Number(m[1]);
  const agent = m[2];
  let issueId;
  if (m[4] !== undefined && Number(m[4]) === Number(m[3])) issueId = Number(m[3]);
  else if (m[4] !== undefined) issueId = Number(m[4]);
  else issueId = Number(m[3]);
  return { rep, agent, issueId, stem };
}

// Phase C cells overlay: for each pushback cell, check if a phase-c judge/tests exists
function loadPhaseCOverlay() {
  const overlay = new Map(); // cellKey → { A, B, applyCleanly, decision: "force-implement" }
  if (!fs.existsSync(`${PHASE_C}/scores`)) return overlay;
  for (const fname of fs.readdirSync(`${PHASE_C}/scores`)) {
    if (!fname.endsWith("-judge.json") && !fname.endsWith("-tests-v8.json")) continue;
    const cellKey = fname.replace(/-judge\.json$|-tests-v8\.json$/, "");
    if (!overlay.has(cellKey)) overlay.set(cellKey, { A: null, B: null, applyCleanly: null, decision: "force-implement" });
    const o = overlay.get(cellKey);
    if (fname.endsWith("-judge.json")) {
      o.A = readJudge(`${PHASE_C}/scores/${fname}`);
    } else {
      const t = readTests(`${PHASE_C}/scores/${fname}`);
      if (t) { o.B = t.B; o.applyCleanly = t.applyCleanly; }
    }
  }
  return overlay;
}

function loadArm(arm, phaseCOverlay) {
  const armDir = ARM_DIRS[arm];
  const cells = [];
  for (const leg of [1, 2]) {
    const logsDir = `/tmp/complex7/curve-redo-data/complex7-${arm}/logs-leg${leg}`;
    const judgeDir = `/tmp/complex7/curve-redo-data/complex7-${arm}/scores-leg${leg}`;
    const v4Dir = `/tmp/complex7/curve-redo-data/v2-scoring/${arm}-complex7`;
    const v6Dir = `${WT}/${armDir}/research/curve-redo-data/v2-scoring/${armDir}`;
    if (!fs.existsSync(logsDir)) continue;
    for (const fname of fs.readdirSync(logsDir).sort()) {
      if (!fname.endsWith(".log")) continue;
      const stem = fname.slice(0, -4);
      const parsed = parseCellKey(stem);
      if (!parsed) continue;
      const env = readLogEnvelope(path.join(logsDir, fname));
      const origDecision = env?.decision ?? null;
      // If this cell pushed back AND we have a phase-c overlay, swap in
      const phaseC = phaseCOverlay.get(stem);
      let A, B, decision, source;
      if (origDecision === "pushback" && phaseC) {
        A = phaseC.A;
        B = phaseC.B;
        decision = "force-implement"; // treated as implement for Q-formula purposes
        source = "phase-c";
      } else {
        A = readJudge(path.join(judgeDir, `${stem}-judge.json`));
        let testResult = null;
        const v6Path = path.join(v6Dir, `${stem}-tests-v6.json`);
        if (fs.existsSync(v6Path)) testResult = readTests(v6Path);
        if (!testResult) {
          const v4Path = path.join(v4Dir, `${stem}-tests-v4.json`);
          if (fs.existsSync(v4Path)) testResult = readTests(v4Path);
        }
        B = testResult?.B ?? null;
        decision = origDecision;
        source = origDecision === "pushback" ? "pushback-v6" : "v6";
      }
      cells.push({ arm, rep: parsed.rep, agent: parsed.agent, issueId: parsed.issueId, decision, A, B, source });
    }
  }
  return cells;
}

// Random-K trim subsample
function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function subsampleTrim(cells, seed) {
  const out = [];
  const byIssue = new Map();
  for (const c of cells) {
    if (!byIssue.has(c.issueId)) byIssue.set(c.issueId, []);
    byIssue.get(c.issueId).push(c);
  }
  const rand = makeRand(seed);
  for (const [, list] of [...byIssue.entries()].sort((a, b) => a[0] - b[0])) {
    if (list.length <= 3) { out.push(...list); continue; }
    const idx = list.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    for (let i = 0; i < 3; i++) out.push(list[idx[i]]);
  }
  return out;
}

function perIssue(cells) {
  const byIssue = new Map();
  for (const c of cells) {
    if (!byIssue.has(c.issueId)) byIssue.set(c.issueId, []);
    byIssue.get(c.issueId).push(c);
  }
  const out = new Map();
  for (const [id, list] of byIssue.entries()) {
    const As = list.map(c => c.A).filter(x => x != null);
    // Include force-implement cells in B (they're implements now)
    const Bs = list.filter(c => c.decision === "implement" || c.decision === "force-implement")
      .map(c => c.B).filter(x => x != null);
    out.set(id, {
      issueId: id, cells: list.length, kA: As.length, kB: Bs.length,
      meanA: meanOf(As), meanB: meanOf(Bs),
      sources: [...new Set(list.map(c => c.source))],
    });
  }
  return out;
}

function stdNormCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const az = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * az);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-az * az);
  return 0.5 * (1 + sign * y);
}
function wilcoxon(diffs) {
  const nz = diffs.filter(d => d !== 0);
  const n = nz.length;
  if (n === 0) return { n: 0, pTwoSided: 1, pGreater: 1, pLess: 1 };
  const ind = nz.map(d => ({ abs: Math.abs(d), sign: d > 0 ? 1 : -1 }));
  ind.sort((a, b) => a.abs - b.abs);
  const ranks = new Array(n); const tg = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && ind[j + 1].abs === ind[i].abs) j++;
    const gs = j - i + 1;
    if (gs > 1) tg.push(gs);
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let wPlus = 0;
  for (let k = 0; k < n; k++) if (ind[k].sign > 0) wPlus += ranks[k];
  const mean = (n * (n + 1)) / 4;
  const tc = tg.reduce((s, t) => s + (t * t * t - t), 0) / 48;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tc;
  if (variance <= 0) return { n, pTwoSided: 1, pGreater: 1, pLess: 1 };
  const stdev = Math.sqrt(variance);
  const zG = (wPlus - mean - 0.5) / stdev;
  const zL = (wPlus - mean + 0.5) / stdev;
  const pG = 1 - stdNormCdf(zG);
  const pL = stdNormCdf(zL);
  return { n, pTwoSided: Math.min(1, 2 * Math.min(pG, pL)), pGreater: pG, pLess: pL };
}
function bootstrap(xs, B = 10000, seed = 0x12345678) {
  if (xs.length === 0) return { mean: null, ci95: [null, null] };
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const stats = new Array(B);
  const n = xs.length;
  for (let b = 0; b < B; b++) { let sum = 0; for (let i = 0; i < n; i++) sum += xs[Math.floor(r() * n)]; stats[b] = sum / n; }
  stats.sort((a, b) => a - b);
  return { mean: stats.reduce((a, b) => a + b, 0) / B, ci95: [stats[Math.floor(0.025 * B)], stats[Math.floor(0.975 * B)]] };
}
function pairOn(byA, byB, axis) {
  const diffs = []; const detail = [];
  for (const id of ISSUE_IDS) {
    const a = byA.get(id); const b = byB.get(id);
    if (!a || !b) continue;
    const va = a[axis]; const vb = b[axis];
    if (va == null || vb == null) continue;
    diffs.push(va - vb);
    detail.push({ issueId: id, t: va, b: vb, d: va - vb });
  }
  const w = wilcoxon(diffs);
  const bs = bootstrap(diffs);
  return { n: diffs.length, meanDiff: bs.mean, ci95: bs.ci95, ...w, detail };
}

const SEEDS = [0x5e1d01, 0xc0ffee, 0xbeef01, 0xdecaf01, 0xfacade];

function runOnce(seed) {
  const overlay = loadPhaseCOverlay();
  const armCells = {};
  const armByIssue = {};
  for (const arm of Object.keys(ARM_DIRS)) {
    let cells = loadArm(arm, overlay);
    if (arm === "trim") cells = subsampleTrim(cells, seed);
    armCells[arm] = cells;
    armByIssue[arm] = perIssue(cells);
  }
  const summary = {};
  for (const arm of Object.keys(ARM_DIRS)) {
    const As = [...armByIssue[arm].values()].map(p => p.meanA).filter(x => x != null);
    const Bs = [...armByIssue[arm].values()].map(p => p.meanB).filter(x => x != null);
    summary[arm] = {
      A: { nIssues: As.length, mean: meanOf(As) },
      B: { nIssues: Bs.length, mean: meanOf(Bs) },
    };
  }
  const pairs = [
    ["tailored", "generalist"],
    ["tailored", "trim"],
    ["prose", "generalist"],
    ["prose", "trim"],
    ["trim", "generalist"],
    ["tailored", "prose"],
  ];
  const out = { summary, pairs: {} };
  for (const [a, b] of pairs) {
    const key = `${a}_vs_${b}`;
    out.pairs[key] = {
      A: pairOn(armByIssue[a], armByIssue[b], "meanA"),
      B: pairOn(armByIssue[a], armByIssue[b], "meanB"),
    };
  }
  // Coverage statistics — how many phase-c cells per arm
  out.coverage = {};
  for (const arm of Object.keys(ARM_DIRS)) {
    const pcCount = armCells[arm].filter(c => c.source === "phase-c").length;
    const total = armCells[arm].length;
    out.coverage[arm] = { phaseCCells: pcCount, total };
  }
  return out;
}

const runs = SEEDS.map(s => ({ seed: `0x${s.toString(16)}`, ...runOnce(s) }));
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), corpus: "complex7-v9-phase-c", seeds: SEEDS, runs }, null, 2));
