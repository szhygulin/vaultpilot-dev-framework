#!/usr/bin/env node
// B-axis-only paired ranking for n=13 implement issues across 4 arms.
// Output: research/curve-redo-data/v2-scoring/b-axis-ranking.json + markdown.

const fs = require("node:fs");
const path = require("node:path");

const WT_ROOT = "/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees";
const HERE = "/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/b-axis-rank";

// Implement-class issues (13). Derived from corpus.json (decisionClass==="implement").
const IMPLEMENTS_13 = [157, 168, 172, 178, 180, 185, 186, 251, 253, 565, 626, 649, 667];
// 173 is plan-only, 669 is pushback per the perIssueTable evidence, 156/162/574/665 are pushback.

// Per-arm input config.
const ARMS = {
  tailored: {
    dir: `${WT_ROOT}/adapt-tailored/research/curve-redo-data/v2-scoring/tailored`,
    suffixes: ["-tests-v2.json", "-baseline.json"],
    cellPattern: (issue, rep) => [
      `bench-r${rep}-agent-super-tailored-${issue}-${issue}`,
    ],
  },
  prose: {
    dir: `${WT_ROOT}/n19-experiment/research/curve-redo-data/v2-scoring/prose`,
    suffixes: ["-tests-v2.json"],
    cellPattern: (issue, rep) => {
      // Map: bench-r<rep>-agent-<agent>-<issue>
      // Discover by scanning dir entries with -<issue>-tests-v2.json suffix.
      return null; // resolved by directory scan
    },
  },
  trim: {
    // Combined: old-13 (this worktree) + new-6 (rescore-trim)
    dirs: [
      `${HERE}/research/curve-redo-data/v2-scoring/trim`,
      `${WT_ROOT}/rescore-trim/research/curve-redo-data/v2-scoring/trim`,
    ],
    suffixes: ["-tests-v2.json"],
  },
  specialist: {
    dirs: [
      `${WT_ROOT}/rescore-specialist/research/curve-redo-data/v2-scoring/specialist`,
      `${HERE}/research/curve-redo-data/v2-scoring/recovery`, // recovered 253, 626
    ],
    suffixes: ["-tests-v2.json"],
  },
};

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return null; }
}

// Compute B (per-cell tests pass rate, 0-100, null if apply=false or total=0)
function bOf(j) {
  if (!j || j.applyCleanly === false || j.total === 0) return null;
  return 100 * (j.passed / j.total);
}

function loadTailoredB(issue) {
  const arm = ARMS.tailored;
  const out = [];
  for (let rep = 1; rep <= 3; rep++) {
    let found = null;
    for (const stem of arm.cellPattern(issue, rep)) {
      for (const suf of arm.suffixes) {
        const p = path.join(arm.dir, stem + suf);
        if (fs.existsSync(p)) { found = readJsonSafe(p); break; }
      }
      if (found) break;
    }
    out.push(bOf(found));
  }
  return out;
}

function loadProseB(issue) {
  const arm = ARMS.prose;
  if (!fs.existsSync(arm.dir)) return [null, null, null];
  const out = [null, null, null];
  for (const f of fs.readdirSync(arm.dir)) {
    const m = /^bench-r(\d+)-agent-([^-]+(?:-[a-z0-9]+)*)-(\d+)(?:-(\d+))?-tests-v2\.json$/.exec(f);
    if (!m) continue;
    const rep = Number(m[1]);
    // The trailing -<issue>-tests-v2.json. m[3] = issueId or m[4] if double-issue.
    const fIssue = m[4] ? Number(m[4]) : Number(m[3]);
    if (fIssue !== issue) continue;
    if (rep < 1 || rep > 3) continue;
    if (out[rep - 1] != null) continue; // first match wins
    out[rep - 1] = bOf(readJsonSafe(path.join(arm.dir, f)));
  }
  return out;
}

function loadTrimB(issue) {
  // New-6 has bench-rN naming. Old-13 (this worktree) has curveStudy-... naming with 3 cells per issue.
  const out = [null, null, null];
  // 1. old-13 from this worktree (curveStudy-agent-916a-trim-{22000-s24026, 35000-s37026, 50000-s52026}-<issue>)
  const old13Dir = ARMS.trim.dirs[0];
  if (fs.existsSync(old13Dir)) {
    const sizes = ["22000-s24026", "35000-s37026", "50000-s52026"];
    // For 565: alternate seeds — find any 3 implement cells
    let i = 0;
    for (const size of sizes) {
      const f = `curveStudy-agent-916a-trim-${size}-${issue}-tests-v2.json`;
      const p = path.join(old13Dir, f);
      if (fs.existsSync(p) && i < 3) {
        out[i++] = bOf(readJsonSafe(p));
      }
    }
    // For 565, the standard sizes are mostly empty (pushback). Look for any other cells:
    if (i < 3) {
      for (const f of fs.readdirSync(old13Dir)) {
        if (!f.startsWith("curveStudy-agent-916a-trim-")) continue;
        if (!f.endsWith(`-${issue}-tests-v2.json`)) continue;
        if (sizes.some(s => f.includes(`trim-${s}-${issue}-`))) continue; // already counted
        if (i >= 3) break;
        out[i++] = bOf(readJsonSafe(path.join(old13Dir, f)));
      }
    }
  }
  // 2. new-6 from rescore-trim
  const new6Dir = ARMS.trim.dirs[1];
  if (fs.existsSync(new6Dir)) {
    for (const f of fs.readdirSync(new6Dir)) {
      const m = /^bench-r(\d+)-agent-916a-trim-[\d-]+s[\d]+-(\d+)-tests-v2\.json$/.exec(f);
      if (!m) continue;
      const rep = Number(m[1]);
      const fIssue = Number(m[2]);
      if (fIssue !== issue) continue;
      if (rep < 1 || rep > 3) continue;
      if (out[rep - 1] != null) continue;
      out[rep - 1] = bOf(readJsonSafe(path.join(new6Dir, f)));
    }
  }
  return out;
}

function loadSpecialistB(issue) {
  const out = [null, null, null];
  // 1. main specialist dir
  const dir = ARMS.specialist.dirs[0];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const m = /^bench-r(\d+)-agent-[^-]+-(\d+)-tests-v2\.json$/.exec(f);
      if (!m) continue;
      const rep = Number(m[1]);
      const fIssue = Number(m[2]);
      if (fIssue !== issue) continue;
      if (rep < 1 || rep > 3) continue;
      out[rep - 1] = bOf(readJsonSafe(path.join(dir, f)));
    }
  }
  // 2. recovery overlay (only fills nulls)
  const recoveryDir = ARMS.specialist.dirs[1];
  if (fs.existsSync(recoveryDir)) {
    for (const f of fs.readdirSync(recoveryDir)) {
      const m = /^bench-r(\d+)-agent-[^-]+-(\d+)-tests-v2\.json$/.exec(f);
      if (!m) continue;
      const rep = Number(m[1]);
      const fIssue = Number(m[2]);
      if (fIssue !== issue) continue;
      if (rep < 1 || rep > 3) continue;
      // Only use recovery if main was null.
      if (out[rep - 1] != null) continue;
      out[rep - 1] = bOf(readJsonSafe(path.join(recoveryDir, f)));
    }
  }
  return out;
}

const LOADERS = {
  tailored: loadTailoredB,
  prose: loadProseB,
  trim: loadTrimB,
  specialist: loadSpecialistB,
};

// -------------------------------------------------------------------------
// Aggregation
// -------------------------------------------------------------------------

const meanOf = (xs) => {
  const valid = xs.filter(v => v != null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};

const medianOf = (xs) => {
  const a = xs.filter(v => v != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Paired Wilcoxon signed-rank, two-sided. Returns {n, W, p}.
function wilcoxon(diffs) {
  const nonzero = diffs.filter(d => d !== 0);
  const n = nonzero.length;
  if (n < 1) return { n: 0, W: 0, p: 1 };
  const abs = nonzero.map(d => ({ d, a: Math.abs(d) })).sort((a, b) => a.a - b.a);
  // Assign tied ranks
  const ranks = new Array(abs.length);
  let i = 0;
  while (i < abs.length) {
    let j = i;
    while (j + 1 < abs.length && abs[j + 1].a === abs[i].a) j++;
    const r = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[k] = r;
    i = j + 1;
  }
  let Wplus = 0, Wminus = 0;
  for (let k = 0; k < abs.length; k++) {
    if (abs[k].d > 0) Wplus += ranks[k];
    else Wminus += ranks[k];
  }
  const W = Math.min(Wplus, Wminus);
  // Normal approximation
  const mean = n * (n + 1) / 4;
  const sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
  const z = sd > 0 ? (W - mean) / sd : 0;
  // Two-sided
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { n, W, Wplus, Wminus, z, p };
}

function normalCdf(x) {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (x > 0) p = 1 - p;
  return p;
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

const arms = ["tailored", "prose", "trim", "specialist"];
const perIssue = {};
for (const issue of IMPLEMENTS_13) {
  perIssue[issue] = {};
  for (const arm of arms) {
    const cells = LOADERS[arm](issue);
    const m = meanOf(cells);
    perIssue[issue][arm] = { cells, mean: m };
  }
}

// Per-arm stats over all 13 issues
const armStats = {};
for (const arm of arms) {
  const means = IMPLEMENTS_13.map(i => perIssue[i][arm].mean);
  const allCells = IMPLEMENTS_13.flatMap(i => perIssue[i][arm].cells);
  const validCells = allCells.filter(v => v != null);
  armStats[arm] = {
    nIssuesWithData: means.filter(v => v != null).length,
    nCellsTotal: allCells.length,
    nCellsValid: validCells.length,
    meanOfPerIssueMeans: meanOf(means),
    medianOfPerIssueMeans: medianOf(means),
    grandMeanOfCells: meanOf(allCells),
    countAboveMidpoint: validCells.filter(v => v > 25).length,
    countAboveHalf: validCells.filter(v => v >= 50).length,
    countAtZero: allCells.filter(v => v === 0).length,
    countNull: allCells.filter(v => v == null).length,
  };
}

// Ranking by mean-of-per-issue-means (B)
const ranking = arms.slice().sort((a, b) => {
  const ma = armStats[a].meanOfPerIssueMeans;
  const mb = armStats[b].meanOfPerIssueMeans;
  if (ma == null) return 1;
  if (mb == null) return -1;
  return mb - ma;
});

// Pairwise paired Wilcoxon over issues where BOTH arms have non-null per-issue mean
const pairwise = {};
for (let i = 0; i < arms.length; i++) {
  for (let j = i + 1; j < arms.length; j++) {
    const a = arms[i], b = arms[j];
    const diffs = [];
    const pairsUsed = [];
    for (const issue of IMPLEMENTS_13) {
      const ma = perIssue[issue][a].mean;
      const mb = perIssue[issue][b].mean;
      if (ma == null || mb == null) continue;
      diffs.push(ma - mb);
      pairsUsed.push({ issue, a: ma, b: mb, diff: ma - mb });
    }
    const w = wilcoxon(diffs);
    pairwise[`${a}_vs_${b}`] = { ...w, pairsUsed: pairsUsed.length, details: pairsUsed };
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  implementsIncluded: IMPLEMENTS_13,
  arms,
  ranking,
  armStats,
  perIssue,
  pairwise,
};

const OUTFILE = path.join(HERE, "research/curve-redo-data/v2-scoring/b-axis-ranking.json");
fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2));
console.log("wrote", OUTFILE);

// Console summary
console.log("\n=== Ranking by mean-of-per-issue-B (n=13 implements) ===");
for (let i = 0; i < ranking.length; i++) {
  const a = ranking[i];
  const s = armStats[a];
  const m = s.meanOfPerIssueMeans;
  console.log(`  ${i + 1}. ${a.padEnd(12)} mean=${m == null ? 'null' : m.toFixed(1)} median=${s.medianOfPerIssueMeans == null ? 'null' : s.medianOfPerIssueMeans.toFixed(1)} cells_valid=${s.nCellsValid}/${s.nCellsTotal} above50=${s.countAboveHalf} above25=${s.countAboveMidpoint} atZero=${s.countAtZero} issues_with_data=${s.nIssuesWithData}/13`);
}

console.log("\n=== Pairwise paired Wilcoxon ===");
for (const [k, v] of Object.entries(pairwise)) {
  console.log(`  ${k.padEnd(35)} n=${v.pairsUsed} W=${v.W?.toFixed(1) || 'N/A'} z=${v.z?.toFixed(2) || 'N/A'} p=${v.p?.toFixed(4) || 'N/A'}`);
}
