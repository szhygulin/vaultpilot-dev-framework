#!/usr/bin/env node
// Super-agent tailored arm — Phase E v2 analyzer.
//
// Three-axis decomposition: judge-A (Opus reasoning grade), tests-B
// (hidden-test pass rate), and cost. Two comparisons:
//   (a) v2 vs prose-baseline: combined-Q + cost only (prose raw A/B is
//       unrecoverable — only the prose-vs-specialist.json comparison JSON
//       survives from PR #272, and it carries treatmentMean* aggregates).
//   (b) v2 vs v1 tailored: all three axes (judge-A, tests-B, cost) — both
//       arms have raw per-cell data so disaggregation is clean.
//
// Wilcoxon signed-rank one-sided per axis + bootstrap CIs on the means.
//
// Usage:
//   node analyze-tailored-v2.cjs \
//     --v2-logs-leg1 ... --v2-scores-leg1 ... \
//     --v2-logs-leg2 ... --v2-scores-leg2 ... \
//     --v1-logs-leg1 ... --v1-scores-leg1 ... \
//     --v1-logs-leg2 ... --v1-scores-leg2 ... \
//     --prose-vs-specialist /tmp/prose-baseline/prose-vs-specialist.json \
//     --picks-v1 ... --picks-v2 ... \
//     --output research/curve-redo-data/super-agent-tailored-v2/comparison-v2.json

const path = require("node:path");
const fs = require("node:fs");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--") && i + 1 < argv.length) {
      args[k.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const BENCH_LOG_RE = /^bench-r(\d+)-(agent-[a-z0-9-]+)-(\d+)\.log$/;

const mean = (xs) => xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[(n - 1) / 2];
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

async function loadArm(armName, leg1Logs, leg1Scores, leg2Logs, leg2Scores, deps) {
  const { aggregateLog, loadCellScores } = deps;
  const cells = [];
  for (const [logsDir, scoresDir] of [[leg1Logs, leg1Scores], [leg2Logs, leg2Scores]]) {
    if (!logsDir || !fs.existsSync(logsDir)) continue;
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
      if (cell.decision === "error" || cell.decision === "error_max_turns" || cell.decision == null) {
        combinedQ = 0;
      } else if (cell.decision === "pushback") {
        combinedQ = A == null ? 0 : 2 * A;
      } else {
        // implement
        if (A == null || B == null) combinedQ = 0;
        else combinedQ = A + B;
      }
      cells.push({
        arm: armName, agentId, issueId, replicate,
        decision: cell.decision, costUsd: cell.costUsd ?? 0,
        A, B, combinedQ,
      });
    }
  }
  return cells;
}

function groupByIssue(cells) {
  const m = new Map();
  for (const c of cells) {
    if (!m.has(c.issueId)) m.set(c.issueId, []);
    m.get(c.issueId).push(c);
  }
  return m;
}

function bootstrapCI(xs, B = 10000, seedInit = 0x12345678) {
  if (xs.length === 0) return { mean: NaN, ci95: [NaN, NaN], ci90: [NaN, NaN], pDirectionPos: NaN, pDirectionNeg: NaN };
  let seed = seedInit;
  const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const stats = [];
  const n = xs.length;
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rand() * n)];
    stats.push(s / n);
  }
  stats.sort((a, b) => a - b);
  const m = stats.reduce((a, b) => a + b, 0) / stats.length;
  return {
    mean: m,
    ci95: [stats[Math.floor(0.025 * stats.length)], stats[Math.floor(0.975 * stats.length)]],
    ci90: [stats[Math.floor(0.05 * stats.length)], stats[Math.floor(0.95 * stats.length)]],
    pDirectionPos: stats.filter((s) => s > 0).length / stats.length,
    pDirectionNeg: stats.filter((s) => s < 0).length / stats.length,
  };
}

// Fisher combination of one-sided p-values.
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
  const args = parseArgs();
  const required = [
    "v2-logs-leg1", "v2-scores-leg1", "v2-logs-leg2", "v2-scores-leg2",
    "v1-logs-leg1", "v1-scores-leg1", "v1-logs-leg2", "v1-scores-leg2",
    "prose-vs-specialist", "output",
  ];
  for (const r of required) {
    if (!args[r]) { process.stderr.write(`Missing --${r}\n`); process.exit(1); }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const { aggregateLog } = require(path.join(distRoot, "research", "curveStudy", "aggregate.js"));
  const { loadCellScores } = require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { wilcoxonSignedRankPaired } = require(path.join(distRoot, "research", "specialistBench", "stats.js"));
  const deps = { aggregateLog, loadCellScores };

  const v2Cells = await loadArm("v2", args["v2-logs-leg1"], args["v2-scores-leg1"], args["v2-logs-leg2"], args["v2-scores-leg2"], deps);
  const v1Cells = await loadArm("v1", args["v1-logs-leg1"], args["v1-scores-leg1"], args["v1-logs-leg2"], args["v1-scores-leg2"], deps);

  const v2ByIssue = groupByIssue(v2Cells);
  const v1ByIssue = groupByIssue(v1Cells);

  // Prose: combined-Q + cost only (from comparison JSON's treatmentMean*).
  const pvs = JSON.parse(fs.readFileSync(path.resolve(args["prose-vs-specialist"]), "utf8"));
  const proseByIssue = new Map();
  for (const p of pvs.perIssue) {
    proseByIssue.set(p.issueId, { combinedQ: p.treatmentMeanQuality, costUsd: p.treatmentMeanCostUsd });
  }

  // Paired issue IDs across all three.
  const pairedIssueIds = [...v2ByIssue.keys()]
    .filter((id) => v1ByIssue.has(id) && proseByIssue.has(id))
    .sort((a, b) => a - b);

  // Per-issue means + pairwise deltas.
  const perIssue = [];
  for (const id of pairedIssueIds) {
    const v2 = v2ByIssue.get(id);
    const v1 = v1ByIssue.get(id);
    const p = proseByIssue.get(id);

    // Per-arm means; A/B exclude null replicates.
    const v2A = mean(v2.map((c) => c.A).filter((x) => x != null));
    const v2B = mean(v2.map((c) => c.B).filter((x) => x != null));
    const v2Q = mean(v2.map((c) => c.combinedQ));
    const v2Cost = mean(v2.map((c) => c.costUsd));
    const v1A = mean(v1.map((c) => c.A).filter((x) => x != null));
    const v1B = mean(v1.map((c) => c.B).filter((x) => x != null));
    const v1Q = mean(v1.map((c) => c.combinedQ));
    const v1Cost = mean(v1.map((c) => c.costUsd));
    perIssue.push({
      issueId: id,
      v2: { meanA: v2A, meanB: v2B, meanCombinedQ: v2Q, meanCostUsd: v2Cost, replicateCount: v2.length },
      v1: { meanA: v1A, meanB: v1B, meanCombinedQ: v1Q, meanCostUsd: v1Cost, replicateCount: v1.length },
      prose: { meanCombinedQ: p.combinedQ, meanCostUsd: p.costUsd },
      // v2 vs v1 deltas
      dA_v2_v1: Number.isFinite(v2A) && Number.isFinite(v1A) ? v2A - v1A : null,
      dB_v2_v1: Number.isFinite(v2B) && Number.isFinite(v1B) ? v2B - v1B : null,
      dQ_v2_v1: v2Q - v1Q,
      dCost_v2_v1: v2Cost - v1Cost,
      // v2 vs prose deltas
      dQ_v2_prose: v2Q - p.combinedQ,
      dCost_v2_prose: v2Cost - p.costUsd,
    });
  }

  function runWilcoxonAndBoot(deltas, oneSided) {
    const finite = deltas.filter((d) => Number.isFinite(d));
    const wilcoxon = wilcoxonSignedRankPaired(finite, oneSided);
    const boot = bootstrapCI(finite);
    return { n: finite.length, wilcoxon, boot };
  }

  // v2 vs v1: judge-A (greater), tests-B (greater), cost (less)
  const v2v1_A_deltas = perIssue.map((p) => p.dA_v2_v1).filter((d) => d != null);
  const v2v1_B_deltas = perIssue.map((p) => p.dB_v2_v1).filter((d) => d != null);
  const v2v1_Q_deltas = perIssue.map((p) => p.dQ_v2_v1);
  const v2v1_Cost_deltas = perIssue.map((p) => p.dCost_v2_v1);

  const v2v1_A = runWilcoxonAndBoot(v2v1_A_deltas, "greater");
  const v2v1_B = runWilcoxonAndBoot(v2v1_B_deltas, "greater");
  const v2v1_Q = runWilcoxonAndBoot(v2v1_Q_deltas, "greater");
  const v2v1_Cost = runWilcoxonAndBoot(v2v1_Cost_deltas, "less");

  // v2 vs prose
  const v2prose_Q_deltas = perIssue.map((p) => p.dQ_v2_prose);
  const v2prose_Cost_deltas = perIssue.map((p) => p.dCost_v2_prose);
  const v2prose_Q = runWilcoxonAndBoot(v2prose_Q_deltas, "greater");
  const v2prose_Cost = runWilcoxonAndBoot(v2prose_Cost_deltas, "less");

  // Fisher per family
  const fisher_v2v1_AB = fisher([v2v1_A.wilcoxon.pValue, v2v1_B.wilcoxon.pValue]);
  const fisher_v2v1_QC = fisher([v2v1_Q.wilcoxon.pValue, v2v1_Cost.wilcoxon.pValue]);
  const fisher_v2prose_QC = fisher([v2prose_Q.wilcoxon.pValue, v2prose_Cost.wilcoxon.pValue]);

  const output = {
    generatedAt: new Date().toISOString(),
    armCounts: { v2: v2Cells.length, v1: v1Cells.length, paired: pairedIssueIds.length },
    perIssue,
    tests: {
      "v2-vs-v1": {
        hypothesis: { A: "median(v2.A - v1.A) > 0", B: "median(v2.B - v1.B) > 0", Q: "median(v2.combinedQ - v1.combinedQ) > 0", cost: "median(v2.cost - v1.cost) < 0" },
        judgeA: v2v1_A,
        testsB: v2v1_B,
        combinedQ: v2v1_Q,
        cost: v2v1_Cost,
        fisherAB: fisher_v2v1_AB,
        fisherQC: fisher_v2v1_QC,
      },
      "v2-vs-prose": {
        hypothesis: { Q: "median(v2.combinedQ - prose.combinedQ) > 0", cost: "median(v2.cost - prose.cost) < 0" },
        combinedQ: v2prose_Q,
        cost: v2prose_Cost,
        fisherQC: fisher_v2prose_QC,
      },
    },
  };

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");

  const fmt = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : "n/a";
  process.stdout.write(`\n=== Per-issue means (v2 / v1 / prose) ===\n`);
  process.stdout.write(`issue\tv2A\tv1A\tdA\tv2B\tv1B\tdB\tv2Q\tv1Q\tproseQ\tv2cost\tv1cost\tproseCost\n`);
  for (const p of perIssue) {
    process.stdout.write(
      `${p.issueId}\t${fmt(p.v2.meanA, 1)}\t${fmt(p.v1.meanA, 1)}\t${fmt(p.dA_v2_v1, 1)}\t` +
      `${fmt(p.v2.meanB, 1)}\t${fmt(p.v1.meanB, 1)}\t${fmt(p.dB_v2_v1, 1)}\t` +
      `${fmt(p.v2.meanCombinedQ, 1)}\t${fmt(p.v1.meanCombinedQ, 1)}\t${fmt(p.prose.meanCombinedQ, 1)}\t` +
      `$${fmt(p.v2.meanCostUsd, 3)}\t$${fmt(p.v1.meanCostUsd, 3)}\t$${fmt(p.prose.meanCostUsd, 3)}\n`
    );
  }

  function renderTest(label, t, isLess = false) {
    const dir = isLess ? "less" : "greater";
    process.stdout.write(
      `\n${label} (n=${t.n}, H1: ${dir} than 0):\n` +
      `  Wilcoxon: w+=${fmt(t.wilcoxon.wPlus, 1)}, z=${fmt(t.wilcoxon.z, 3)}, p=${fmt(t.wilcoxon.pValue, 5)}\n` +
      `  Bootstrap: mean=${fmt(t.boot.mean, 3)}, 95% CI=[${fmt(t.boot.ci95[0], 3)}, ${fmt(t.boot.ci95[1], 3)}], P(${isLess ? "<0" : ">0"})=${fmt(isLess ? t.boot.pDirectionNeg : t.boot.pDirectionPos, 3)}\n`
    );
  }

  process.stdout.write(`\n=== v2 vs v1 tailored — three axes ===\n`);
  renderTest("Judge-A (Opus reasoning)", v2v1_A);
  renderTest("Tests-B (hidden tests)", v2v1_B);
  renderTest("Combined Q (= 2A or A+B)", v2v1_Q);
  renderTest("Cost", v2v1_Cost, true);
  process.stdout.write(`\nFisher (A + B): chi²=${fmt(fisher_v2v1_AB.chiSq, 3)} (df=4), combined p=${fmt(fisher_v2v1_AB.pValue, 5)}\n`);
  process.stdout.write(`Fisher (Q + cost): chi²=${fmt(fisher_v2v1_QC.chiSq, 3)} (df=4), combined p=${fmt(fisher_v2v1_QC.pValue, 5)}\n`);

  process.stdout.write(`\n=== v2 vs prose-baseline — combined Q + cost ===\n`);
  renderTest("Combined Q", v2prose_Q);
  renderTest("Cost", v2prose_Cost, true);
  process.stdout.write(`\nFisher (Q + cost): chi²=${fmt(fisher_v2prose_QC.chiSq, 3)} (df=4), combined p=${fmt(fisher_v2prose_QC.pValue, 5)}\n`);

  process.stdout.write(`\nOutput written to ${args.output}\n`);
}

main().catch((err) => { process.stderr.write(`${err.stack ?? err}\n`); process.exit(1); });
