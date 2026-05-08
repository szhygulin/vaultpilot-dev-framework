#!/usr/bin/env node
// Pair-wise compare two `bench-r{N}-{agent}-{issueId}.log` arms.
//
// Sister to combine-and-compare.cjs — that one expects a `curveStudy-`-
// prefixed baseline (the trim-baseline log shape). For naive vs specialist
// (picker-vs-content Phase A, plan #265), both arms ship in the bench-r*
// shape, so we reuse the treatment reader for both sides.
//
// Reuses combine-and-compare.cjs's helpers via require() — single source of
// truth for cell aggregation, A+B quality, paired Wilcoxon, Hedges' g.

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

const REQUIRED = [
  "baseline-leg1-logs",
  "baseline-leg1-scores",
  "baseline-leg2-logs",
  "baseline-leg2-scores",
  "treatment-leg1-logs",
  "treatment-leg1-scores",
  "treatment-leg2-logs",
  "treatment-leg2-scores",
  "output",
];

const TREATMENT_LOG_RE = /^bench-r(\d+)-(agent-[a-z0-9-]+)-(\d+)\.log$/;

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function readBenchCells(logsDir, qualityFromAB, scores, arm, distRoot) {
  if (!dirExists(logsDir)) return [];
  const { aggregateLog } = require(path.join(distRoot, "research", "curveStudy", "aggregate.js"));
  const out = [];
  for (const f of fs.readdirSync(logsDir).sort()) {
    const m = TREATMENT_LOG_RE.exec(f);
    if (!m) continue;
    const replicate = Number(m[1]);
    const agentId = m[2];
    const issueId = Number(m[3]);
    const cell = await aggregateLog({
      logPath: path.join(logsDir, f),
      agentId,
      agentSizeBytes: 0,
      issueId,
    });
    if (!cell) continue;
    const cellKey = `bench-r${replicate}-${agentId}-${issueId}`;
    const sc = scores.get(cellKey);
    const quality = qualityFromAB({
      decision: cell.decision,
      judge: sc?.judge,
      test: sc?.test,
    });
    out.push({
      arm,
      agentId,
      issueId,
      replicate,
      decision: cell.decision,
      costUsd: cell.costUsd,
      quality,
    });
  }
  return out;
}

async function main() {
  const args = parseArgs();
  for (const r of REQUIRED) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const { qualityFromAB, loadCellScores } = require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { wilcoxonSignedRankPaired, hedgesG, mean, median, coefficientOfVariation } =
    require(path.join(distRoot, "research", "specialistBench", "stats.js"));

  const [bs1, bs2, ts1, ts2] = await Promise.all([
    loadCellScores(args["baseline-leg1-scores"]),
    loadCellScores(args["baseline-leg2-scores"]),
    loadCellScores(args["treatment-leg1-scores"]),
    loadCellScores(args["treatment-leg2-scores"]),
  ]);
  const baselineScores = new Map([...bs1, ...bs2]);
  const treatmentScores = new Map([...ts1, ...ts2]);

  const baselineCells = [
    ...(await readBenchCells(args["baseline-leg1-logs"], qualityFromAB, baselineScores, "baseline", distRoot)),
    ...(await readBenchCells(args["baseline-leg2-logs"], qualityFromAB, baselineScores, "baseline", distRoot)),
  ];
  const treatmentCells = [
    ...(await readBenchCells(args["treatment-leg1-logs"], qualityFromAB, treatmentScores, "treatment", distRoot)),
    ...(await readBenchCells(args["treatment-leg2-logs"], qualityFromAB, treatmentScores, "treatment", distRoot)),
  ];

  const byIssue = (cells) => {
    const m = new Map();
    for (const c of cells) {
      let b = m.get(c.issueId);
      if (!b) { b = []; m.set(c.issueId, b); }
      b.push(c);
    }
    return m;
  };
  const baselineByIssue = byIssue(baselineCells);
  const treatmentByIssue = byIssue(treatmentCells);

  const pairedIssueIds = [...treatmentByIssue.keys()]
    .filter((id) => baselineByIssue.has(id))
    .sort((a, b) => a - b);

  const perIssue = [];
  for (const issueId of pairedIssueIds) {
    const tCells = treatmentByIssue.get(issueId);
    const bCells = baselineByIssue.get(issueId);
    const tQ = tCells.map((c) => c.quality);
    const bQ = bCells.map((c) => c.quality);
    const tCost = tCells.map((c) => c.costUsd);
    const bCost = bCells.map((c) => c.costUsd);
    const tMeanQ = mean(tQ);
    const bMeanQ = mean(bQ);
    const tMeanCost = mean(tCost);
    const bMeanCost = mean(bCost);
    perIssue.push({
      issueId,
      treatmentMeanQuality: tMeanQ,
      baselineMeanQuality: bMeanQ,
      dQuality: tMeanQ - bMeanQ,
      treatmentMeanCostUsd: tMeanCost,
      baselineMeanCostUsd: bMeanCost,
      dCost: tMeanCost - bMeanCost,
      treatmentReplicateCount: tCells.length,
      baselineReplicateCount: bCells.length,
      treatmentQualityCv: coefficientOfVariation(tQ),
      treatmentCostCv: coefficientOfVariation(tCost),
    });
  }

  const dQs = perIssue.map((p) => p.dQuality);
  const dCosts = perIssue.map((p) => p.dCost);
  const wilcoxonQuality = perIssue.length >= 1 ? wilcoxonSignedRankPaired(dQs, "greater") : null;
  const wilcoxonCost = perIssue.length >= 1 ? wilcoxonSignedRankPaired(dCosts, "less") : null;
  const hedgesQuality = perIssue.length >= 2 ? hedgesG(dQs) : Number.NaN;

  const output = {
    generatedAt: new Date().toISOString(),
    baselineArm: { cellCount: baselineCells.length, uniqueIssues: baselineByIssue.size },
    treatmentArm: { cellCount: treatmentCells.length, uniqueIssues: treatmentByIssue.size },
    pairedIssueCount: pairedIssueIds.length,
    perIssue,
    test: {
      hypothesis: "median(dQuality = treatment - baseline) > 0",
      wilcoxonQuality,
      wilcoxonCost,
      hedgesGQuality: hedgesQuality,
    },
  };
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");

  const fmt = (x, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : "n/a");
  process.stdout.write(`\n=== bench-vs-bench paired comparison ===\n`);
  process.stdout.write(
    `baseline cells: ${baselineCells.length} (${baselineByIssue.size} issues); ` +
      `treatment cells: ${treatmentCells.length} (${treatmentByIssue.size} issues)\n`,
  );
  process.stdout.write(`paired issues (intersection): ${pairedIssueIds.length}\n\n`);
  if (perIssue.length === 0) {
    process.stdout.write(`No paired issues — nothing to test.\nOutput written to ${args.output}.\n`);
    return;
  }
  process.stdout.write(`issueId\ttreatQ\tbaseQ\tdQ\ttreatCost\tbaseCost\tdCost\n`);
  for (const p of perIssue) {
    process.stdout.write(
      `${p.issueId}\t${fmt(p.treatmentMeanQuality, 1)}\t${fmt(p.baselineMeanQuality, 1)}\t` +
        `${fmt(p.dQuality, 1)}\t$${fmt(p.treatmentMeanCostUsd, 2)}\t$${fmt(p.baselineMeanCostUsd, 2)}\t` +
        `$${fmt(p.dCost, 2)}\n`,
    );
  }
  process.stdout.write(`\n`);
  if (wilcoxonQuality) {
    process.stdout.write(
      `Wilcoxon (quality, H1: dQ > 0): n=${wilcoxonQuality.n}, w+=${fmt(wilcoxonQuality.wPlus, 1)}, ` +
        `z=${fmt(wilcoxonQuality.z, 3)}, p=${fmt(wilcoxonQuality.pValue, 4)}\n`,
    );
  }
  if (wilcoxonCost) {
    process.stdout.write(
      `Wilcoxon (cost,    H1: dCost < 0): n=${wilcoxonCost.n}, w+=${fmt(wilcoxonCost.wPlus, 1)}, ` +
        `z=${fmt(wilcoxonCost.z, 3)}, p=${fmt(wilcoxonCost.pValue, 4)}\n`,
    );
  }
  process.stdout.write(`Hedges' g (quality): ${fmt(hedgesQuality, 3)}\n`);
  process.stdout.write(`\nOutput written to ${args.output}.\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
