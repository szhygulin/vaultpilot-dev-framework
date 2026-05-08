#!/usr/bin/env node
// Curve-redo follow-up — Step 8 of feature-plans/curve-redo-specialist-followup-plan.md.
//
// Pairs orchestrator-picked specialists (treatment) against the merged trim
// baseline (control) per issue and runs a one-sided paired Wilcoxon test.
// Per-cell quality uses the same A+B formula as combine-legs.cjs (judge ∈
// 0..50 + hidden-test pass rate ∈ 0..50, or 2A for pushback) — no envelope-
// label shortcut.
//
// Usage:
//   node combine-and-compare.cjs \
//     --baseline-leg1-logs <dir> --baseline-leg1-scores <dir> \
//     --baseline-leg2-logs <dir> --baseline-leg2-scores <dir> \
//     --treatment-leg1-logs <dir> --treatment-leg1-scores <dir> \
//     --treatment-leg2-logs <dir> --treatment-leg2-scores <dir> \
//     --picks <picks.tsv> \
//     --output <comparison.json>
//
// Reads built dist/ — run `npm run build` first.

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
  "picks",
  "output",
];

const BASELINE_PREFIX = "curveStudy-";
const TREATMENT_LOG_RE = /^bench-r(\d+)-(agent-[a-z0-9-]+)-(\d+)\.log$/;

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function readBaselineCells(logsDir, qualityFromAB, scores) {
  if (!dirExists(logsDir)) return [];
  const { aggregateLog } = require(path.join(distRoot, "research", "curveStudy", "aggregate.js"));
  const re = new RegExp(`^${BASELINE_PREFIX}(agent-[a-z0-9-]+)-(\\d+)\\.log$`);
  const out = [];
  for (const f of fs.readdirSync(logsDir).sort()) {
    const m = re.exec(f);
    if (!m) continue;
    const agentId = m[1];
    const issueId = Number(m[2]);
    const cell = await aggregateLog({
      logPath: path.join(logsDir, f),
      agentId,
      agentSizeBytes: 0,
      issueId,
    });
    if (!cell) continue;
    const cellKey = `${agentId}-${issueId}`;
    const sc = scores.get(cellKey);
    const quality = qualityFromAB({
      decision: cell.decision,
      judge: sc?.judge,
      test: sc?.test,
    });
    out.push({
      arm: "baseline",
      agentId,
      issueId,
      decision: cell.decision,
      costUsd: cell.costUsd,
      quality,
      log: cell.log,
    });
  }
  return out;
}

async function readTreatmentCells(logsDir, qualityFromAB, scores) {
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
    // Treatment scores live under the bench-r<N>-<agent>-<issue> key (the
    // dispatch script writes them with that filename stem). cellScores's
    // loadCellScores derives the key by stripping the -tests.json /
    // -judge.json suffix, so the prefix is preserved.
    const cellKey = `bench-r${replicate}-${agentId}-${issueId}`;
    const sc = scores.get(cellKey);
    const quality = qualityFromAB({
      decision: cell.decision,
      judge: sc?.judge,
      test: sc?.test,
    });
    out.push({
      arm: "treatment",
      agentId,
      issueId,
      replicate,
      decision: cell.decision,
      costUsd: cell.costUsd,
      quality,
      log: cell.log,
    });
  }
  return out;
}

let distRoot;

async function main() {
  const args = parseArgs();
  for (const r of REQUIRED) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.stderr.write(`Required flags: ${REQUIRED.map((x) => "--" + x).join(" ")}\n`);
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  distRoot = path.join(repoRoot, "dist", "src");
  const { qualityFromAB } = require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { loadCellScores } = require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { wilcoxonSignedRankPaired, hedgesG, mean, median, coefficientOfVariation } =
    require(path.join(distRoot, "research", "specialistBench", "stats.js"));

  // Load all four score directories (baseline × 2 legs, treatment × 2 legs).
  const [bs1, bs2, ts1, ts2] = await Promise.all([
    loadCellScores(args["baseline-leg1-scores"]),
    loadCellScores(args["baseline-leg2-scores"]),
    loadCellScores(args["treatment-leg1-scores"]),
    loadCellScores(args["treatment-leg2-scores"]),
  ]);
  const baselineScores = new Map([...bs1, ...bs2]);
  const treatmentScores = new Map([...ts1, ...ts2]);

  // Read both arms.
  const baselineCells = [
    ...(await readBaselineCells(args["baseline-leg1-logs"], qualityFromAB, baselineScores)),
    ...(await readBaselineCells(args["baseline-leg2-logs"], qualityFromAB, baselineScores)),
  ];
  const treatmentCells = [
    ...(await readTreatmentCells(args["treatment-leg1-logs"], qualityFromAB, treatmentScores)),
    ...(await readTreatmentCells(args["treatment-leg2-logs"], qualityFromAB, treatmentScores)),
  ];

  // Group by issue.
  const byIssue = (cells) => {
    const m = new Map();
    for (const c of cells) {
      let b = m.get(c.issueId);
      if (!b) {
        b = [];
        m.set(c.issueId, b);
      }
      b.push(c);
    }
    return m;
  };
  const baselineByIssue = byIssue(baselineCells);
  const treatmentByIssue = byIssue(treatmentCells);

  // Issues paired in both arms.
  const pairedIssueIds = [...treatmentByIssue.keys()]
    .filter((id) => baselineByIssue.has(id))
    .sort((a, b) => a - b);

  // Picks → rationale lookup for stratification.
  const picks = new Map();
  if (fs.existsSync(args.picks)) {
    const raw = fs.readFileSync(args.picks, "utf-8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith("issueId\t")) continue;
      const parts = line.split("\t");
      const issueId = Number(parts[0]);
      const agentId = parts[1];
      const rationale = parts[2];
      if (Number.isFinite(issueId)) picks.set(issueId, { agentId, rationale });
    }
  }

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
    const bMedianCost = median(bCost);
    const tQualityCv = coefficientOfVariation(tQ);
    const tCostCv = coefficientOfVariation(tCost);
    const pick = picks.get(issueId);
    perIssue.push({
      issueId,
      treatmentMeanQuality: tMeanQ,
      baselineMeanQuality: bMeanQ,
      dQuality: tMeanQ - bMeanQ,
      treatmentMeanCostUsd: tMeanCost,
      baselineMedianCostUsd: bMedianCost,
      dCost: tMeanCost - bMedianCost,
      treatmentReplicateCount: tCells.length,
      baselineCellCount: bCells.length,
      treatmentQualityCv: tQualityCv,
      treatmentCostCv: tCostCv,
      pickedAgentId: pick?.agentId ?? null,
      pickRationale: pick?.rationale ?? null,
    });
  }

  // Primary test: paired Wilcoxon, one-sided "greater" on dQuality.
  const dQs = perIssue.map((p) => p.dQuality);
  const dCosts = perIssue.map((p) => p.dCost);
  const wilcoxonQuality = perIssue.length >= 1
    ? wilcoxonSignedRankPaired(dQs, "greater")
    : null;
  const wilcoxonCost = perIssue.length >= 1
    ? wilcoxonSignedRankPaired(dCosts, "less")
    : null;
  const hedgesQuality = perIssue.length >= 2 ? hedgesG(dQs) : Number.NaN;

  // Stratify by rationale.
  const byRationale = new Map();
  for (const p of perIssue) {
    const r = p.pickRationale ?? "(unmatched)";
    let bucket = byRationale.get(r);
    if (!bucket) {
      bucket = [];
      byRationale.set(r, bucket);
    }
    bucket.push(p);
  }
  const stratified = [...byRationale.entries()]
    .map(([rationale, items]) => ({
      rationale,
      issueCount: items.length,
      meanDQuality: items.length > 0 ? mean(items.map((p) => p.dQuality)) : Number.NaN,
      meanDCost: items.length > 0 ? mean(items.map((p) => p.dCost)) : Number.NaN,
    }))
    .sort((a, b) => a.rationale.localeCompare(b.rationale));

  const output = {
    generatedAt: new Date().toISOString(),
    baselineArm: {
      cellCount: baselineCells.length,
      uniqueIssues: baselineByIssue.size,
    },
    treatmentArm: {
      cellCount: treatmentCells.length,
      uniqueIssues: treatmentByIssue.size,
    },
    pairedIssueCount: pairedIssueIds.length,
    perIssue,
    test: {
      hypothesis: "median(dQuality = treatment - baseline) > 0",
      wilcoxonQuality,
      wilcoxonCost,
      hedgesGQuality: hedgesQuality,
    },
    picksDistribution: stratified,
  };

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");

  // Headline (also used by the empty-result smoke check). Avoid raw NaN /
  // Infinity in output text per CLAUDE.md "smoke-test the empty-result path".
  const fmt = (x, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : "n/a");
  process.stdout.write(`\n=== specialist-redo paired comparison ===\n`);
  process.stdout.write(
    `baseline cells: ${baselineCells.length} (${baselineByIssue.size} issues); ` +
      `treatment cells: ${treatmentCells.length} (${treatmentByIssue.size} issues)\n`,
  );
  process.stdout.write(`paired issues (intersection): ${pairedIssueIds.length}\n\n`);
  if (perIssue.length === 0) {
    process.stdout.write(`No paired issues — nothing to test.\n`);
    process.stdout.write(`Output written to ${args.output}.\n`);
    return;
  }
  process.stdout.write(
    `issueId\ttreatQ\tbaseQ\tdQ\ttreatCost\tbaseCost\tdCost\trationale\tagent\n`,
  );
  for (const p of perIssue) {
    process.stdout.write(
      `${p.issueId}\t${fmt(p.treatmentMeanQuality, 1)}\t${fmt(p.baselineMeanQuality, 1)}\t` +
        `${fmt(p.dQuality, 1)}\t$${fmt(p.treatmentMeanCostUsd, 2)}\t$${fmt(p.baselineMedianCostUsd, 2)}\t` +
        `$${fmt(p.dCost, 2)}\t${p.pickRationale ?? "?"}\t${p.pickedAgentId ?? "?"}\n`,
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
  process.stdout.write(`Hedges' g (quality): ${fmt(hedgesQuality, 3)}\n\n`);
  process.stdout.write(`Picks distribution / per-rationale stratification:\n`);
  for (const s of stratified) {
    process.stdout.write(
      `  ${s.rationale}: n=${s.issueCount}, mean dQ=${fmt(s.meanDQuality, 1)}, mean dCost=$${fmt(s.meanDCost, 2)}\n`,
    );
  }
  process.stdout.write(`\nOutput written to ${args.output}.\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
