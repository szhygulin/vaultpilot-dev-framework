#!/usr/bin/env node
// n=19 analyzer — merges:
//   - Old 13 issues: per-issue means from prose-vs-specialist.json
//     (treatmentMean* = prose; baselineMean* = specialist) + tailored
//     raw cells from research/curve-redo-data/super-agent-tailored/.
//   - New 6 issues: raw cells from n19-tailored and n19-prose (this run).
//
// Output: paired Wilcoxon + bootstrap CIs at n=19, with three axes:
// judge-A (post-#293 hidden tests give us B for all 19), tests-B, and
// cost. For the 13-issue baseline, tailored-v1 has full A/B raw data
// from #289 but prose only has aggregate combined-Q + cost, so the
// judge-A and tests-B axes for those 13 use the v1-only data (tailored)
// vs the prose aggregates (combined-Q only).
//
// Usage:
//   node analyze-n19.cjs \
//     --tailored-old13-logs <main-worktree>/research/curve-redo-data/super-agent-tailored/logs-legX \
//     --tailored-old13-scores ... (both legs) \
//     --tailored-new6-logs research/curve-redo-data/n19-tailored/logs-legX \
//     --tailored-new6-scores ... (both legs) \
//     --prose-new6-logs research/curve-redo-data/n19-prose/logs-legX \
//     --prose-new6-scores ... \
//     --prose-old13-aggregate /tmp/prose-baseline/prose-vs-specialist.json \
//     --output research/curve-redo-data/n19/comparison-n19.json

const path = require("node:path");
const fs = require("node:fs");

function parseArgs() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--") && i + 1 < argv.length) { a[k.slice(2)] = argv[i + 1]; i++; }
  }
  return a;
}

const BENCH_LOG_RE = /^bench-r(\d+)-(agent-[a-z0-9-]+)-(\d+)\.log$/;
const mean = (xs) => xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

async function loadCellsFromDir(logsDir, scoresDir, deps) {
  const { aggregateLog, loadCellScores } = deps;
  const cells = [];
  if (!fs.existsSync(logsDir)) return cells;
  const scores = await loadCellScores(scoresDir);
  for (const f of fs.readdirSync(logsDir).sort()) {
    const m = BENCH_LOG_RE.exec(f);
    if (!m) continue;
    const replicate = Number(m[1]);
    const agentId = m[2];
    const issueId = Number(m[3]);
    const cell = await aggregateLog({ logPath: path.join(logsDir, f), agentId, agentSizeBytes: 0, issueId });
    if (!cell) continue;
    const cellKey = `bench-r${replicate}-${agentId}-${issueId}`;
    const sc = scores.get(cellKey);
    const judgeOk = sc?.judge && !sc.judge.isError;
    const A = judgeOk ? clamp(sc.judge.median, 0, 50) : null;
    const testOk = sc?.test && sc.test.applyCleanly && !sc.test.errorReason && sc.test.total > 0;
    const passRate = testOk ? sc.test.passed / sc.test.total : null;
    const B = passRate != null ? clamp(passRate * 50, 0, 50) : null;
    let combinedQ;
    if (cell.decision === "error" || cell.decision === "error_max_turns" || cell.decision == null) combinedQ = 0;
    else if (cell.decision === "pushback") combinedQ = A == null ? 0 : 2 * A;
    else combinedQ = (A == null || B == null) ? 0 : A + B;
    cells.push({ agentId, issueId, replicate, decision: cell.decision, costUsd: cell.costUsd ?? 0, A, B, combinedQ });
  }
  return cells;
}

function bootstrap(xs, B = 10000, seed = 0x12345678) {
  if (xs.length === 0) return { mean: NaN, ci95: [NaN, NaN], pPos: NaN, pNeg: NaN };
  let s = seed;
  const rand = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const stats = [];
  const n = xs.length;
  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += xs[Math.floor(rand() * n)];
    stats.push(sum / n);
  }
  stats.sort((a, b) => a - b);
  return {
    mean: stats.reduce((a, b) => a + b, 0) / stats.length,
    ci95: [stats[Math.floor(0.025 * stats.length)], stats[Math.floor(0.975 * stats.length)]],
    pPos: stats.filter((s) => s > 0).length / stats.length,
    pNeg: stats.filter((s) => s < 0).length / stats.length,
  };
}

function fisher(ps) {
  const k = ps.length;
  const x = -2 * ps.reduce((s, p) => s + Math.log(p), 0);
  let surv = 0, fact = 1;
  for (let j = 0; j < k; j++) {
    if (j > 0) fact *= j;
    surv += Math.pow(x / 2, j) * Math.exp(-x / 2) / fact;
  }
  return { chiSq: x, df: 2 * k, pValue: surv };
}

async function main() {
  const a = parseArgs();
  const required = [
    "tailored-old13-logs-leg1", "tailored-old13-scores-leg1",
    "tailored-old13-logs-leg2", "tailored-old13-scores-leg2",
    "tailored-new6-logs-leg1", "tailored-new6-scores-leg1",
    "tailored-new6-logs-leg2", "tailored-new6-scores-leg2",
    "prose-new6-logs-leg1", "prose-new6-scores-leg1",
    "prose-new6-logs-leg2", "prose-new6-scores-leg2",
    "prose-old13-aggregate", "output",
  ];
  for (const r of required) {
    if (!a[r]) { process.stderr.write(`Missing --${r}\n`); process.exit(1); }
  }
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const { aggregateLog } = require(path.join(distRoot, "research", "curveStudy", "aggregate.js"));
  const { loadCellScores } = require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { wilcoxonSignedRankPaired } = require(path.join(distRoot, "research", "specialistBench", "stats.js"));
  const deps = { aggregateLog, loadCellScores };

  // ---- Load tailored cells: old 13 + new 6 ----
  const tailoredCells = [
    ...await loadCellsFromDir(a["tailored-old13-logs-leg1"], a["tailored-old13-scores-leg1"], deps),
    ...await loadCellsFromDir(a["tailored-old13-logs-leg2"], a["tailored-old13-scores-leg2"], deps),
    ...await loadCellsFromDir(a["tailored-new6-logs-leg1"], a["tailored-new6-scores-leg1"], deps),
    ...await loadCellsFromDir(a["tailored-new6-logs-leg2"], a["tailored-new6-scores-leg2"], deps),
  ];

  // ---- Load prose cells (new 6 only — raw); old 13 from aggregates ----
  const proseNew6Cells = [
    ...await loadCellsFromDir(a["prose-new6-logs-leg1"], a["prose-new6-scores-leg1"], deps),
    ...await loadCellsFromDir(a["prose-new6-logs-leg2"], a["prose-new6-scores-leg2"], deps),
  ];
  const proseOld13 = JSON.parse(fs.readFileSync(path.resolve(a["prose-old13-aggregate"]), "utf8"));
  const proseOld13ById = new Map();
  for (const p of proseOld13.perIssue) {
    proseOld13ById.set(p.issueId, { combinedQ: p.treatmentMeanQuality, costUsd: p.treatmentMeanCostUsd });
  }

  // ---- Group by issue ----
  function groupBy(cells) {
    const m = new Map();
    for (const c of cells) {
      if (!m.has(c.issueId)) m.set(c.issueId, []);
      m.get(c.issueId).push(c);
    }
    return m;
  }
  const tailoredByIssue = groupBy(tailoredCells);
  const proseNew6ByIssue = groupBy(proseNew6Cells);

  // ---- Per-issue means + paired deltas (combined-Q + cost) ----
  const allIssues = [...tailoredByIssue.keys()].sort((x, y) => x - y);
  const perIssue = [];
  for (const id of allIssues) {
    const tCells = tailoredByIssue.get(id);
    const tQ = mean(tCells.map((c) => c.combinedQ));
    const tCost = mean(tCells.map((c) => c.costUsd));
    let proseQ, proseCost, proseSource;
    if (proseNew6ByIssue.has(id)) {
      const pCells = proseNew6ByIssue.get(id);
      proseQ = mean(pCells.map((c) => c.combinedQ));
      proseCost = mean(pCells.map((c) => c.costUsd));
      proseSource = "raw-new6";
    } else if (proseOld13ById.has(id)) {
      const p = proseOld13ById.get(id);
      proseQ = p.combinedQ;
      proseCost = p.costUsd;
      proseSource = "aggregate-old13";
    } else {
      continue; // no prose comparator
    }
    perIssue.push({
      issueId: id,
      tailoredMeanQ: tQ,
      proseMeanQ: proseQ,
      dQ: tQ - proseQ,
      tailoredMeanCost: tCost,
      proseMeanCost: proseCost,
      dCost: tCost - proseCost,
      proseSource,
      tailoredReplicateCount: tCells.length,
    });
  }

  // ---- Wilcoxon + bootstrap at n=19 ----
  const dQs = perIssue.map((p) => p.dQ);
  const dCosts = perIssue.map((p) => p.dCost);
  const wilcoxonQ = wilcoxonSignedRankPaired(dQs, "greater");
  const wilcoxonCost = wilcoxonSignedRankPaired(dCosts, "less");
  const bootQ = bootstrap(dQs);
  const bootCost = bootstrap(dCosts);
  const fisher_QC = fisher([wilcoxonQ.pValue, wilcoxonCost.pValue]);

  // ---- Also report n=13 (old) and n=6 (new) splits for comparison ----
  const oldPerIssue = perIssue.filter((p) => p.proseSource === "aggregate-old13");
  const newPerIssue = perIssue.filter((p) => p.proseSource === "raw-new6");
  const oldDQs = oldPerIssue.map((p) => p.dQ);
  const oldDCosts = oldPerIssue.map((p) => p.dCost);
  const newDQs = newPerIssue.map((p) => p.dQ);
  const newDCosts = newPerIssue.map((p) => p.dCost);

  const wOld_Q = oldDQs.length >= 1 ? wilcoxonSignedRankPaired(oldDQs, "greater") : null;
  const wOld_C = oldDCosts.length >= 1 ? wilcoxonSignedRankPaired(oldDCosts, "less") : null;
  const wNew_Q = newDQs.length >= 1 ? wilcoxonSignedRankPaired(newDQs, "greater") : null;
  const wNew_C = newDCosts.length >= 1 ? wilcoxonSignedRankPaired(newDCosts, "less") : null;

  const output = {
    generatedAt: new Date().toISOString(),
    n: perIssue.length,
    armCounts: { tailored: tailoredCells.length, proseNew6: proseNew6Cells.length, proseOld13Aggregate: proseOld13.perIssue.length },
    perIssue,
    tests: {
      n19: {
        wilcoxonQuality: wilcoxonQ,
        wilcoxonCost: wilcoxonCost,
        bootstrapQuality: bootQ,
        bootstrapCost: bootCost,
        fisherQC: fisher_QC,
      },
      n13_old: {
        wilcoxonQuality: wOld_Q,
        wilcoxonCost: wOld_C,
        bootstrapQuality: bootstrap(oldDQs),
        bootstrapCost: bootstrap(oldDCosts),
      },
      n6_new: {
        wilcoxonQuality: wNew_Q,
        wilcoxonCost: wNew_C,
        bootstrapQuality: newDQs.length > 0 ? bootstrap(newDQs) : null,
        bootstrapCost: newDCosts.length > 0 ? bootstrap(newDCosts) : null,
      },
    },
  };

  fs.mkdirSync(path.dirname(path.resolve(a.output)), { recursive: true });
  fs.writeFileSync(a.output, JSON.stringify(output, null, 2) + "\n");

  const fmt = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : "n/a";
  process.stdout.write(`\n=== n=${perIssue.length} per-issue (sorted by id) ===\n`);
  process.stdout.write(`issue\ttailQ\tproseQ\tdQ\ttailCost\tproseCost\tdCost\tproseSrc\n`);
  for (const p of perIssue) {
    process.stdout.write(`${p.issueId}\t${fmt(p.tailoredMeanQ, 1)}\t${fmt(p.proseMeanQ, 1)}\t${fmt(p.dQ, 1)}\t$${fmt(p.tailoredMeanCost, 3)}\t$${fmt(p.proseMeanCost, 3)}\t$${fmt(p.dCost, 3)}\t${p.proseSource}\n`);
  }

  function renderTest(label, n, w, b, less = false) {
    process.stdout.write(`\n--- ${label} ---\n`);
    if (w) process.stdout.write(`  Wilcoxon (n=${w.n}, H1: ${less ? "less" : "greater"}): w+=${fmt(w.wPlus, 1)}, z=${fmt(w.z, 3)}, p=${fmt(w.pValue, 5)}\n`);
    if (b) {
      process.stdout.write(`  Bootstrap: mean=${fmt(b.mean, 3)}, 95% CI [${fmt(b.ci95[0], 3)}, ${fmt(b.ci95[1], 3)}], P(${less ? "<0" : ">0"})=${fmt(less ? b.pNeg : b.pPos, 3)}\n`);
    }
  }

  process.stdout.write(`\n========== n=19 (primary) ==========\n`);
  renderTest("Combined Q (H1: tailored > prose)", perIssue.length, wilcoxonQ, bootQ);
  renderTest("Cost (H1: tailored < prose)", perIssue.length, wilcoxonCost, bootCost, true);
  process.stdout.write(`\nFisher (Q + cost): chi²(4)=${fmt(fisher_QC.chiSq, 3)}, p=${fmt(fisher_QC.pValue, 5)}\n`);

  process.stdout.write(`\n========== n=13 (old, aggregate prose) ==========\n`);
  renderTest("Combined Q", oldDQs.length, wOld_Q, output.tests.n13_old.bootstrapQuality);
  renderTest("Cost", oldDCosts.length, wOld_C, output.tests.n13_old.bootstrapCost, true);

  process.stdout.write(`\n========== n=6 (new, raw prose) ==========\n`);
  renderTest("Combined Q", newDQs.length, wNew_Q, output.tests.n6_new.bootstrapQuality);
  renderTest("Cost", newDCosts.length, wNew_C, output.tests.n6_new.bootstrapCost, true);

  process.stdout.write(`\nWritten to ${a.output}\n`);
}

main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(1); });
