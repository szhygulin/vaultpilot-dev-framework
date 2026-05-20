#!/usr/bin/env node
// Super-agent tailored arm — Phase E: paired Wilcoxon vs prose-baseline.
//
// Both arms (tailored and prose) write logs as
// `bench-r<replicate>-<agentId>-<issueId>.log` and scores as
// `<cellKey>-tests.json` / `<cellKey>-judge.json`. We pair by issueId
// and run two one-sided Wilcoxon tests (quality H1: tailored > prose;
// cost H1: tailored < prose). Soft-bar verdict: pass on either dimension
// at unadjusted p<0.05 = significant.
//
// Optional descriptive 5-arm cross-tab (tailored, prose, trim, specialist,
// naive) — no p-tests on the secondary arms; their existence is
// narrative-only context.
//
// Usage:
//   node combine-tailored.cjs \
//     --tailored-leg1-logs <dir> --tailored-leg1-scores <dir> \
//     --tailored-leg2-logs <dir> --tailored-leg2-scores <dir> \
//     --prose-leg1-logs <dir>    --prose-leg1-scores <dir> \
//     --prose-leg2-logs <dir>    --prose-leg2-scores <dir> \
//     --picks <picks-tailored.tsv> \
//     --output <comparison.json> \
//     [--trim-leg1-logs <dir>      --trim-leg1-scores <dir> \
//      --trim-leg2-logs <dir>      --trim-leg2-scores <dir>] \
//     [--specialist-leg1-logs <dir> ... --specialist-leg2-scores <dir>] \
//     [--naive-leg1-logs <dir>     ...  --naive-leg2-scores <dir>]
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
  "tailored-leg1-logs", "tailored-leg1-scores",
  "tailored-leg2-logs", "tailored-leg2-scores",
  "prose-leg1-logs",    "prose-leg1-scores",
  "prose-leg2-logs",    "prose-leg2-scores",
  "picks", "output",
];

// `bench-r<replicate>-<agentId>-<issueId>.log` — used by both prose-baseline
// and tailored arms. The trim baseline uses `curveStudy-<agent>-<issue>`.
const BENCH_LOG_RE = /^bench-r(\d+)-(agent-[a-z0-9-]+)-(\d+)\.log$/;
const CURVE_LOG_RE = /^curveStudy-(agent-[a-z0-9-]+)-(\d+)\.log$/;

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

let distRoot;

async function readBenchCells(armName, logsDir, qualityFromAB, scores) {
  if (!logsDir || !dirExists(logsDir)) return [];
  const { aggregateLog } = require(path.join(distRoot, "research", "curveStudy", "aggregate.js"));
  const out = [];
  for (const f of fs.readdirSync(logsDir).sort()) {
    const m = BENCH_LOG_RE.exec(f);
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
    const quality = qualityFromAB({ decision: cell.decision, judge: sc?.judge, test: sc?.test });
    out.push({
      arm: armName, agentId, issueId, replicate,
      decision: cell.decision, costUsd: cell.costUsd, quality,
    });
  }
  return out;
}

async function readCurveCells(armName, logsDir, qualityFromAB, scores) {
  if (!logsDir || !dirExists(logsDir)) return [];
  const { aggregateLog } = require(path.join(distRoot, "research", "curveStudy", "aggregate.js"));
  const out = [];
  for (const f of fs.readdirSync(logsDir).sort()) {
    const m = CURVE_LOG_RE.exec(f);
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
    const quality = qualityFromAB({ decision: cell.decision, judge: sc?.judge, test: sc?.test });
    out.push({
      arm: armName, agentId, issueId,
      decision: cell.decision, costUsd: cell.costUsd, quality,
    });
  }
  return out;
}

function groupByIssue(cells) {
  const m = new Map();
  for (const c of cells) {
    let b = m.get(c.issueId);
    if (!b) { b = []; m.set(c.issueId, b); }
    b.push(c);
  }
  return m;
}

async function main() {
  const args = parseArgs();
  for (const r of REQUIRED) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.stderr.write(`Required: ${REQUIRED.map((x) => "--" + x).join(" ")}\n`);
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  distRoot = path.join(repoRoot, "dist", "src");
  const { qualityFromAB, loadCellScores } = require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { wilcoxonSignedRankPaired, hedgesG, mean, median } =
    require(path.join(distRoot, "research", "specialistBench", "stats.js"));

  // Load every score directory we were given.
  const scoreDirs = {
    tailored: [args["tailored-leg1-scores"], args["tailored-leg2-scores"]],
    prose:    [args["prose-leg1-scores"],    args["prose-leg2-scores"]],
    trim:       [args["trim-leg1-scores"],       args["trim-leg2-scores"]],
    specialist: [args["specialist-leg1-scores"], args["specialist-leg2-scores"]],
    naive:      [args["naive-leg1-scores"],      args["naive-leg2-scores"]],
  };
  const scoreMaps = {};
  for (const [arm, dirs] of Object.entries(scoreDirs)) {
    const merged = new Map();
    for (const d of dirs) {
      if (!d) continue;
      const m = await loadCellScores(d);
      for (const [k, v] of m) merged.set(k, v);
    }
    scoreMaps[arm] = merged;
  }

  // Load every log directory we were given. Bench-shaped vs curve-shaped
  // is a function of the arm.
  const logDirs = {
    tailored:   { logs: [args["tailored-leg1-logs"],   args["tailored-leg2-logs"]],   shape: "bench" },
    prose:      { logs: [args["prose-leg1-logs"],      args["prose-leg2-logs"]],      shape: "bench" },
    trim:       { logs: [args["trim-leg1-logs"],       args["trim-leg2-logs"]],       shape: "curve" },
    specialist: { logs: [args["specialist-leg1-logs"], args["specialist-leg2-logs"]], shape: "bench" },
    naive:      { logs: [args["naive-leg1-logs"],      args["naive-leg2-logs"]],      shape: "bench" },
  };
  const cellsByArm = {};
  for (const [arm, { logs, shape }] of Object.entries(logDirs)) {
    const reader = shape === "bench" ? readBenchCells : readCurveCells;
    const all = [];
    for (const d of logs) {
      if (!d) continue;
      all.push(...(await reader(arm, d, qualityFromAB, scoreMaps[arm])));
    }
    cellsByArm[arm] = all;
  }

  // Pair per-issue: mean Q across replicates per arm.
  const tailoredByIssue = groupByIssue(cellsByArm.tailored);
  const proseByIssue = groupByIssue(cellsByArm.prose);
  const pairedIssueIds = [...tailoredByIssue.keys()]
    .filter((id) => proseByIssue.has(id))
    .sort((a, b) => a - b);

  // Picks → rationale lookup for stratification.
  const picks = new Map();
  if (fs.existsSync(args.picks)) {
    const raw = fs.readFileSync(args.picks, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith("issueId\t")) continue;
      const parts = line.split("\t");
      const issueId = Number(parts[0]);
      if (Number.isFinite(issueId)) {
        picks.set(issueId, { agentId: parts[1], rationale: parts[2] });
      }
    }
  }

  const perIssue = [];
  for (const issueId of pairedIssueIds) {
    const tCells = tailoredByIssue.get(issueId);
    const pCells = proseByIssue.get(issueId);
    const tQ = tCells.map((c) => c.quality);
    const pQ = pCells.map((c) => c.quality);
    const tCost = tCells.map((c) => c.costUsd);
    const pCost = pCells.map((c) => c.costUsd);
    const pick = picks.get(issueId);
    perIssue.push({
      issueId,
      tailoredMeanQuality: mean(tQ),
      proseMeanQuality: mean(pQ),
      dQuality: mean(tQ) - mean(pQ),
      tailoredMeanCostUsd: mean(tCost),
      proseMeanCostUsd: mean(pCost),
      dCost: mean(tCost) - mean(pCost),
      tailoredReplicateCount: tCells.length,
      proseReplicateCount: pCells.length,
      pickedAgentId: pick?.agentId ?? null,
      pickRationale: pick?.rationale ?? null,
    });
  }

  // Two one-sided Wilcoxon tests.
  const dQs = perIssue.map((p) => p.dQuality);
  const dCosts = perIssue.map((p) => p.dCost);
  const wilcoxonQuality = perIssue.length >= 1
    ? wilcoxonSignedRankPaired(dQs, "greater")
    : null;
  const wilcoxonCost = perIssue.length >= 1
    ? wilcoxonSignedRankPaired(dCosts, "less")
    : null;
  const hedgesQuality = perIssue.length >= 2 ? hedgesG(dQs) : Number.NaN;

  // Secondary descriptive cross-tab. mean Q and mean cost per arm,
  // restricted to issues that appear in BOTH tailored and that arm.
  // No p-tests — narrative-only context for the writeup.
  const secondary = {};
  for (const arm of ["trim", "specialist", "naive"]) {
    const armByIssue = groupByIssue(cellsByArm[arm]);
    const overlap = pairedIssueIds.filter((id) => armByIssue.has(id));
    if (overlap.length === 0) continue;
    let dQSum = 0, dCostSum = 0, n = 0;
    const perIssueOverlay = [];
    for (const issueId of overlap) {
      const tQ = mean(tailoredByIssue.get(issueId).map((c) => c.quality));
      const tCost = mean(tailoredByIssue.get(issueId).map((c) => c.costUsd));
      const aQ = mean(armByIssue.get(issueId).map((c) => c.quality));
      const aCost = mean(armByIssue.get(issueId).map((c) => c.costUsd));
      dQSum += (tQ - aQ);
      dCostSum += (tCost - aCost);
      n++;
      perIssueOverlay.push({ issueId, tailoredQ: tQ, [`${arm}Q`]: aQ, dQ: tQ - aQ });
    }
    secondary[arm] = {
      pairedIssueCount: n,
      meanDQuality: n > 0 ? dQSum / n : null,
      meanDCost: n > 0 ? dCostSum / n : null,
      perIssue: perIssueOverlay,
    };
  }

  // Soft-bar verdict.
  const qPass = wilcoxonQuality && Number.isFinite(wilcoxonQuality.pValue) && wilcoxonQuality.pValue < 0.05;
  const cPass = wilcoxonCost    && Number.isFinite(wilcoxonCost.pValue)    && wilcoxonCost.pValue    < 0.05;
  const verdict =
    qPass && cPass ? "win-on-both"
    : qPass ? "win-on-quality"
    : cPass ? "win-on-cost"
    : "no-significant-difference";

  const output = {
    generatedAt: new Date().toISOString(),
    armCounts: Object.fromEntries(Object.entries(cellsByArm).map(([k, v]) => [k, v.length])),
    pairedIssueCount: pairedIssueIds.length,
    perIssue,
    test: {
      hypothesis: {
        quality: "median(dQuality = tailored - prose) > 0",
        cost: "median(dCost = tailored - prose) < 0",
        softBar: "win on either dimension at unadjusted p < 0.05",
        familyWiseRateNote: "Holm-Bonferroni: smaller p must be < 0.025 if family-wise correction applied (~0.0975 uncorrected family rate)",
      },
      wilcoxonQuality,
      wilcoxonCost,
      hedgesGQuality: hedgesQuality,
      verdict,
    },
    secondaryDescriptive: secondary,
  };

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");

  // Empty-result-aware formatter — never emit raw NaN / Infinity.
  const fmt = (x, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : "n/a");

  process.stdout.write(`\n=== super-agent-tailored vs prose-baseline ===\n`);
  process.stdout.write(`tailored cells: ${cellsByArm.tailored.length} (${tailoredByIssue.size} issues)\n`);
  process.stdout.write(`prose    cells: ${cellsByArm.prose.length} (${proseByIssue.size} issues)\n`);
  process.stdout.write(`paired issues:  ${pairedIssueIds.length}\n\n`);

  if (perIssue.length === 0) {
    process.stdout.write(`No paired issues — nothing to test.\n`);
    process.stdout.write(`Output written to ${args.output}.\n`);
    return;
  }

  process.stdout.write(`issueId\ttailQ\tproseQ\tdQ\ttailCost\tproseCost\tdCost\trationale\n`);
  for (const p of perIssue) {
    process.stdout.write(
      `${p.issueId}\t${fmt(p.tailoredMeanQuality, 1)}\t${fmt(p.proseMeanQuality, 1)}\t` +
        `${fmt(p.dQuality, 1)}\t$${fmt(p.tailoredMeanCostUsd, 2)}\t$${fmt(p.proseMeanCostUsd, 2)}\t` +
        `$${fmt(p.dCost, 2)}\t${p.pickRationale ?? "?"}\n`,
    );
  }
  process.stdout.write(`\n`);
  if (wilcoxonQuality) {
    process.stdout.write(
      `Wilcoxon (quality, H1: dQ > 0):    n=${wilcoxonQuality.n}, w+=${fmt(wilcoxonQuality.wPlus, 1)}, ` +
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
  process.stdout.write(`\nVerdict: ${verdict}\n`);

  if (Object.keys(secondary).length > 0) {
    process.stdout.write(`\nSecondary descriptive cross-tab (no p-test):\n`);
    for (const [arm, s] of Object.entries(secondary)) {
      process.stdout.write(
        `  vs ${arm}: n=${s.pairedIssueCount}, mean dQ=${fmt(s.meanDQuality, 1)}, mean dCost=$${fmt(s.meanDCost, 2)}\n`,
      );
    }
  }

  process.stdout.write(`\nOutput written to ${args.output}.\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
