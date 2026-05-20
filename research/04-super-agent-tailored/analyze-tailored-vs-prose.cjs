#!/usr/bin/env node
// Super-agent tailored arm — Phase E adapter.
//
// `combine-tailored.cjs` requires raw prose-baseline logs+scores, but those
// were gitignored runtime data and didn't survive. The prose-baseline
// comparison JSONs (committed in PR #272 under prose-baseline-results.tar.gz)
// preserve per-issue prose mean Q + mean cost as the `treatmentMean*` fields
// (treatment = prose, baseline = the other arm being compared). That's
// enough for the primary hypothesis (paired Wilcoxon on dQ/dCost).
//
// This script:
//   1. Reads tailored cells from logs-leg{1,2} + scores-leg{1,2} (raw).
//   2. Reads prose per-issue means from prose-vs-specialist.json (the
//      cost column is complete there; prose-vs-trim.json has Q-only).
//   3. Pairs by issueId, runs the two one-sided Wilcoxon tests + soft-bar
//      verdict, mirroring combine-tailored.cjs.
//   4. Adds the secondary 5-arm cross-tab from the comparison JSONs.
//
// Usage:
//   node analyze-tailored-vs-prose.cjs \
//     --tailored-logs-leg1 ... --tailored-scores-leg1 ... \
//     --tailored-logs-leg2 ... --tailored-scores-leg2 ... \
//     --prose-vs-specialist /tmp/prose-baseline/prose-vs-specialist.json \
//     --prose-vs-trim       /tmp/prose-baseline/prose-vs-trim.json \
//     --prose-vs-naive      /tmp/prose-baseline/prose-vs-naive.json \
//     --picks               research/curve-redo-data/super-agent-tailored/picks-tailored.tsv \
//     --output              research/curve-redo-data/super-agent-tailored/comparison.json

const path = require("node:path");
const fs = require("node:fs");

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--") && i + 1 < argv.length) {
      out[k.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

const BENCH_LOG_RE = /^bench-r(\d+)-(agent-[a-z0-9-]+)-(\d+)\.log$/;

async function readTailoredCells(logsDir, scoreDir, qualityFromAB, loadCellScores) {
  const scores = await loadCellScores(scoreDir);
  const out = [];
  for (const f of fs.readdirSync(logsDir).sort()) {
    const m = BENCH_LOG_RE.exec(f);
    if (!m) continue;
    const replicate = Number(m[1]);
    const agentId = m[2];
    const issueId = Number(m[3]);
    const { aggregateLog } = require(path.join(__dirname, "..", "..", "..", "dist", "src", "research", "curveStudy", "aggregate.js"));
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
      agentId, issueId, replicate,
      decision: cell.decision, costUsd: cell.costUsd, quality,
    });
  }
  return out;
}

function mean(xs) {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

async function main() {
  const args = parseArgs();
  const required = [
    "tailored-logs-leg1", "tailored-scores-leg1",
    "tailored-logs-leg2", "tailored-scores-leg2",
    "prose-vs-specialist", "prose-vs-trim", "prose-vs-naive",
    "picks", "output",
  ];
  for (const r of required) {
    if (!args[r]) { process.stderr.write(`Missing --${r}\n`); process.exit(1); }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const { qualityFromAB, loadCellScores } =
    require(path.join(distRoot, "research", "curveStudy", "cellScores.js"));
  const { wilcoxonSignedRankPaired, hedgesG } =
    require(path.join(distRoot, "research", "specialistBench", "stats.js"));

  // Tailored: raw cells from both legs.
  const tailored = [
    ...await readTailoredCells(path.resolve(args["tailored-logs-leg1"]), path.resolve(args["tailored-scores-leg1"]), qualityFromAB, loadCellScores),
    ...await readTailoredCells(path.resolve(args["tailored-logs-leg2"]), path.resolve(args["tailored-scores-leg2"]), qualityFromAB, loadCellScores),
  ];
  const tailoredByIssue = new Map();
  for (const c of tailored) {
    if (!tailoredByIssue.has(c.issueId)) tailoredByIssue.set(c.issueId, []);
    tailoredByIssue.get(c.issueId).push(c);
  }

  // Prose: per-issue means from comparison JSON. Use prose-vs-specialist
  // (complete Q + cost). Sanity-check that prose-vs-naive agrees.
  const pvs = JSON.parse(fs.readFileSync(path.resolve(args["prose-vs-specialist"]), "utf8"));
  const pvt = JSON.parse(fs.readFileSync(path.resolve(args["prose-vs-trim"]), "utf8"));
  const pvn = JSON.parse(fs.readFileSync(path.resolve(args["prose-vs-naive"]), "utf8"));
  const proseByIssue = new Map();
  const proseConsistency = [];
  for (const p of pvs.perIssue) {
    proseByIssue.set(p.issueId, { q: p.treatmentMeanQuality, cost: p.treatmentMeanCostUsd });
    // cross-check across files
    const t = pvt.perIssue.find(x => x.issueId === p.issueId);
    const n = pvn.perIssue.find(x => x.issueId === p.issueId);
    const dq = Math.max(
      Math.abs(p.treatmentMeanQuality - t.treatmentMeanQuality),
      Math.abs(p.treatmentMeanQuality - n.treatmentMeanQuality),
    );
    if (dq > 0.01) proseConsistency.push({ issueId: p.issueId, maxQDelta: dq });
  }

  // Picks → rationale lookup.
  const picks = new Map();
  if (fs.existsSync(args.picks)) {
    const raw = fs.readFileSync(args.picks, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith("issueId\t")) continue;
      const parts = line.split("\t");
      const issueId = Number(parts[0]);
      if (Number.isFinite(issueId)) picks.set(issueId, { agentId: parts[1], rationale: parts[2] });
    }
  }

  // Pair.
  const pairedIssueIds = [...tailoredByIssue.keys()].filter(id => proseByIssue.has(id)).sort((a, b) => a - b);
  const perIssue = [];
  for (const id of pairedIssueIds) {
    const tCells = tailoredByIssue.get(id);
    const tQ = mean(tCells.map(c => c.quality));
    const tCost = mean(tCells.map(c => c.costUsd));
    const p = proseByIssue.get(id);
    const pick = picks.get(id);
    perIssue.push({
      issueId: id,
      tailoredMeanQuality: tQ,
      proseMeanQuality: p.q,
      dQuality: tQ - p.q,
      tailoredMeanCostUsd: tCost,
      proseMeanCostUsd: p.cost,
      dCost: tCost - p.cost,
      tailoredReplicateCount: tCells.length,
      pickRationale: pick?.rationale ?? null,
    });
  }

  // Two one-sided Wilcoxon tests.
  const dQs = perIssue.map(p => p.dQuality);
  const dCosts = perIssue.map(p => p.dCost);
  const wilcoxonQuality = wilcoxonSignedRankPaired(dQs, "greater");
  const wilcoxonCost = wilcoxonSignedRankPaired(dCosts, "less");
  const hedgesGQuality = hedgesG(dQs);

  // Soft-bar verdict.
  const qPass = wilcoxonQuality && Number.isFinite(wilcoxonQuality.pValue) && wilcoxonQuality.pValue < 0.05;
  const cPass = wilcoxonCost && Number.isFinite(wilcoxonCost.pValue) && wilcoxonCost.pValue < 0.05;
  const verdict =
    qPass && cPass ? "win-on-both"
    : qPass ? "win-on-quality"
    : cPass ? "win-on-cost"
    : "no-significant-difference";

  // Descriptive 5-arm: tailored is our raw; prose/trim/specialist/naive
  // mean Q + (where available) mean cost from comparison JSONs.
  // baselineMeanX in each prose-vs-X.json = the OTHER arm's per-issue mean.
  const otherArms = {
    specialist: pvs.perIssue,
    trim: pvt.perIssue,
    naive: pvn.perIssue,
  };
  const secondary = {};
  for (const [arm, perIssueArr] of Object.entries(otherArms)) {
    const overlay = [];
    let dQSum = 0, dCostSum = 0, dCostN = 0, n = 0;
    for (const id of pairedIssueIds) {
      const t = perIssue.find(p => p.issueId === id);
      const a = perIssueArr.find(x => x.issueId === id);
      if (!t || !a) continue;
      const aQ = a.baselineMeanQuality;
      const aCost = a.baselineMeanCostUsd;
      dQSum += (t.tailoredMeanQuality - aQ);
      n++;
      if (Number.isFinite(aCost)) {
        dCostSum += (t.tailoredMeanCostUsd - aCost);
        dCostN++;
      }
      overlay.push({ issueId: id, tailoredQ: t.tailoredMeanQuality, [`${arm}Q`]: aQ, dQ: t.tailoredMeanQuality - aQ, tailoredCost: t.tailoredMeanCostUsd, [`${arm}Cost`]: aCost, dCost: Number.isFinite(aCost) ? t.tailoredMeanCostUsd - aCost : null });
    }
    secondary[arm] = {
      pairedIssueCount: n,
      meanDQuality: n > 0 ? dQSum / n : null,
      meanDCost: dCostN > 0 ? dCostSum / dCostN : null,
      perIssue: overlay,
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    armCounts: {
      tailored: tailored.length,
      paired: pairedIssueIds.length,
    },
    proseConsistencyAcrossFiles: proseConsistency.length === 0 ? "ok" : { warnings: proseConsistency },
    perIssue,
    test: {
      hypothesis: {
        quality: "median(dQuality = tailored - prose) > 0",
        cost: "median(dCost = tailored - prose) < 0",
        softBar: "win on either dimension at unadjusted p < 0.05",
        familyWiseRateNote: "Holm-Bonferroni: smaller p must be < 0.025 if family-wise correction applied",
      },
      wilcoxonQuality,
      wilcoxonCost,
      hedgesGQuality,
      verdict,
    },
    secondaryDescriptive: secondary,
  };

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");

  const fmt = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : "n/a";
  process.stdout.write(`\n=== super-agent-tailored vs prose-baseline ===\n`);
  process.stdout.write(`tailored cells: ${tailored.length} (${tailoredByIssue.size} issues)\n`);
  process.stdout.write(`prose source:   prose-vs-specialist.json (per-issue means)\n`);
  process.stdout.write(`paired issues:  ${pairedIssueIds.length}\n\n`);
  process.stdout.write(`issueId\ttailQ\tproseQ\tdQ\ttailCost\tproseCost\tdCost\trationale\n`);
  for (const p of perIssue) {
    process.stdout.write(
      `${p.issueId}\t${fmt(p.tailoredMeanQuality, 2)}\t${fmt(p.proseMeanQuality, 2)}\t${fmt(p.dQuality, 2)}\t` +
      `$${fmt(p.tailoredMeanCostUsd, 4)}\t$${fmt(p.proseMeanCostUsd, 4)}\t$${fmt(p.dCost, 4)}\t${p.pickRationale ?? "?"}\n`
    );
  }
  process.stdout.write(`\n`);
  process.stdout.write(
    `Wilcoxon quality (H1: dQ > 0): n=${wilcoxonQuality.n}, w+=${fmt(wilcoxonQuality.wPlus, 1)}, z=${fmt(wilcoxonQuality.z, 3)}, p=${fmt(wilcoxonQuality.pValue, 5)}\n`
  );
  process.stdout.write(
    `Wilcoxon cost    (H1: dC < 0): n=${wilcoxonCost.n}, w+=${fmt(wilcoxonCost.wPlus, 1)}, z=${fmt(wilcoxonCost.z, 3)}, p=${fmt(wilcoxonCost.pValue, 5)}\n`
  );
  process.stdout.write(`Hedges' g (quality): ${fmt(hedgesGQuality, 3)}\n`);
  process.stdout.write(`\nVerdict: ${verdict}\n`);
  process.stdout.write(`\nSecondary descriptive (vs trim/specialist/naive):\n`);
  for (const [arm, s] of Object.entries(secondary)) {
    process.stdout.write(`  ${arm}: meanDQ=${fmt(s.meanDQuality, 2)}, meanDCost=${s.meanDCost == null ? "n/a" : "$"+fmt(s.meanDCost, 4)}, paired=${s.pairedIssueCount}\n`);
  }
  process.stdout.write(`\nOutput written to ${args.output}\n`);
}

main().catch(err => { process.stderr.write(`${err.stack ?? err}\n`); process.exit(1); });
