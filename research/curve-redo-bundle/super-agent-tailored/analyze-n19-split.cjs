#!/usr/bin/env node
// n=19 split analyzer — separates the quality axis into:
//   - Judge-A (Opus reasoning grade, 0-50): valid for every cell with a
//     non-error judge.
//   - Tests-B (hidden-test pass rate × 50, 0-50): valid for implement
//     cells with a non-empty diff that applied cleanly to the test clone.
//
// Comparison constraints:
//   - Tailored: raw cells available for all 19 issues — full A and B
//     per-issue means.
//   - Prose-baseline: raw cells only for the new 6 issues (this run's
//     dispatch). Old 13 prose has only aggregate combined-Q from
//     prose-vs-specialist.json; A and B cannot be split.
//
// Therefore:
//   - Paired Wilcoxon on A: n=6 (where both arms have raw A).
//   - Paired Wilcoxon on B: n≤6, restricted to issues where BOTH arms
//     had at least one valid B per side (excludes all-pushback issues).
//   - Tailored A and B descriptive distributions: n=19 (no prose pair).
//   - Combined Q remains the n=19 primary test (paper-over for prose
//     old-13 via aggregate).

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
    cells.push({ agentId, issueId, replicate, decision: cell.decision, costUsd: cell.costUsd ?? 0, A, B });
  }
  return cells;
}

function groupBy(cells) {
  const m = new Map();
  for (const c of cells) {
    if (!m.has(c.issueId)) m.set(c.issueId, []);
    m.get(c.issueId).push(c);
  }
  return m;
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

async function main() {
  const a = parseArgs();
  const required = [
    "tailored-old13-logs-leg1", "tailored-old13-scores-leg1",
    "tailored-old13-logs-leg2", "tailored-old13-scores-leg2",
    "tailored-new6-logs-leg1", "tailored-new6-scores-leg1",
    "tailored-new6-logs-leg2", "tailored-new6-scores-leg2",
    "prose-new6-logs-leg1", "prose-new6-scores-leg1",
    "prose-new6-logs-leg2", "prose-new6-scores-leg2",
    "output",
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

  const tailored = [
    ...await loadCellsFromDir(a["tailored-old13-logs-leg1"], a["tailored-old13-scores-leg1"], deps),
    ...await loadCellsFromDir(a["tailored-old13-logs-leg2"], a["tailored-old13-scores-leg2"], deps),
    ...await loadCellsFromDir(a["tailored-new6-logs-leg1"], a["tailored-new6-scores-leg1"], deps),
    ...await loadCellsFromDir(a["tailored-new6-logs-leg2"], a["tailored-new6-scores-leg2"], deps),
  ];
  const proseNew6 = [
    ...await loadCellsFromDir(a["prose-new6-logs-leg1"], a["prose-new6-scores-leg1"], deps),
    ...await loadCellsFromDir(a["prose-new6-logs-leg2"], a["prose-new6-scores-leg2"], deps),
  ];

  const tailoredByIssue = groupBy(tailored);
  const proseByIssue = groupBy(proseNew6);
  const allIssueIds = [...tailoredByIssue.keys()].sort((x, y) => x - y);

  // Per-issue summaries: A and B means, nullable when no replicate had a value.
  function issueSummary(cells) {
    const A_vals = cells.map((c) => c.A).filter((x) => x != null);
    const B_vals = cells.map((c) => c.B).filter((x) => x != null);
    return {
      meanA: A_vals.length > 0 ? mean(A_vals) : null,
      meanB: B_vals.length > 0 ? mean(B_vals) : null,
      replicatesWithA: A_vals.length,
      replicatesWithB: B_vals.length,
      decisions: [...new Set(cells.map((c) => c.decision))],
    };
  }

  // Tailored per-issue (n=19).
  const tailoredPerIssue = [];
  for (const id of allIssueIds) {
    const s = issueSummary(tailoredByIssue.get(id));
    tailoredPerIssue.push({ issueId: id, ...s });
  }

  // Prose per-issue (n=6).
  const prosePerIssue = [];
  for (const id of [...proseByIssue.keys()].sort((x, y) => x - y)) {
    const s = issueSummary(proseByIssue.get(id));
    prosePerIssue.push({ issueId: id, ...s });
  }

  // Paired A and B on n=6.
  const pairedNew6 = [];
  for (const t of tailoredPerIssue) {
    const p = prosePerIssue.find((x) => x.issueId === t.issueId);
    if (!p) continue;
    pairedNew6.push({
      issueId: t.issueId,
      tailoredA: t.meanA, proseA: p.meanA,
      dA: (t.meanA != null && p.meanA != null) ? t.meanA - p.meanA : null,
      tailoredB: t.meanB, proseB: p.meanB,
      dB: (t.meanB != null && p.meanB != null) ? t.meanB - p.meanB : null,
    });
  }

  const A_deltas = pairedNew6.map((p) => p.dA).filter((d) => d != null);
  const B_deltas = pairedNew6.map((p) => p.dB).filter((d) => d != null);

  const wA = A_deltas.length >= 1 ? wilcoxonSignedRankPaired(A_deltas, "greater") : null;
  const wB = B_deltas.length >= 1 ? wilcoxonSignedRankPaired(B_deltas, "greater") : null;
  const bootA = bootstrap(A_deltas);
  const bootB = bootstrap(B_deltas);

  const output = {
    generatedAt: new Date().toISOString(),
    notes: [
      "Old 13 prose A/B cannot be split (only aggregate combined-Q survives from PR #272).",
      "Paired Wilcoxon on A-axis: n=" + A_deltas.length + " (new 6 where both arms have valid A).",
      "Paired Wilcoxon on B-axis: n=" + B_deltas.length + " (new 6 implements where both arms have valid B).",
      "Tailored A/B distribution can still be reported as n=19 descriptives.",
    ],
    tailoredPerIssue,
    prosePerIssue,
    pairedNew6,
    tests: {
      judgeA_paired_new6: { n: A_deltas.length, wilcoxon: wA, bootstrap: bootA },
      testsB_paired_new6: { n: B_deltas.length, wilcoxon: wB, bootstrap: bootB },
    },
  };

  fs.mkdirSync(path.dirname(path.resolve(a.output)), { recursive: true });
  fs.writeFileSync(a.output, JSON.stringify(output, null, 2) + "\n");

  const fmt = (x, d = 3) => x == null ? "n/a" : Number.isFinite(x) ? x.toFixed(d) : "n/a";

  process.stdout.write(`\n=== Tailored per-issue (n=${tailoredPerIssue.length}) — A and B means ===\n`);
  process.stdout.write(`issue\tmeanA\tmeanB\trepA\trepB\tdecisions\n`);
  for (const r of tailoredPerIssue) {
    process.stdout.write(`${r.issueId}\t${fmt(r.meanA, 2)}\t${fmt(r.meanB, 2)}\t${r.replicatesWithA}/3\t${r.replicatesWithB}/3\t${r.decisions.join(",")}\n`);
  }

  process.stdout.write(`\n=== Prose per-issue (new 6 only) — A and B means ===\n`);
  process.stdout.write(`issue\tmeanA\tmeanB\trepA\trepB\tdecisions\n`);
  for (const r of prosePerIssue) {
    process.stdout.write(`${r.issueId}\t${fmt(r.meanA, 2)}\t${fmt(r.meanB, 2)}\t${r.replicatesWithA}/3\t${r.replicatesWithB}/3\t${r.decisions.join(",")}\n`);
  }

  process.stdout.write(`\n=== Paired deltas (new 6) ===\n`);
  process.stdout.write(`issue\ttailA\tproseA\tdA\ttailB\tproseB\tdB\n`);
  for (const p of pairedNew6) {
    process.stdout.write(`${p.issueId}\t${fmt(p.tailoredA, 2)}\t${fmt(p.proseA, 2)}\t${fmt(p.dA, 2)}\t${fmt(p.tailoredB, 2)}\t${fmt(p.proseB, 2)}\t${fmt(p.dB, 2)}\n`);
  }

  process.stdout.write(`\n=== Paired Wilcoxon (n=${A_deltas.length} on A, n=${B_deltas.length} on B) ===\n`);
  if (wA) {
    process.stdout.write(`Judge-A  (H1: tailored > prose): w+=${fmt(wA.wPlus, 1)}, z=${fmt(wA.z, 3)}, p=${fmt(wA.pValue, 5)}\n`);
    process.stdout.write(`  Bootstrap: mean=${fmt(bootA.mean, 3)}, 95% CI [${fmt(bootA.ci95[0], 3)}, ${fmt(bootA.ci95[1], 3)}], P(>0)=${fmt(bootA.pPos, 3)}\n`);
  }
  if (wB) {
    process.stdout.write(`Tests-B  (H1: tailored > prose): w+=${fmt(wB.wPlus, 1)}, z=${fmt(wB.z, 3)}, p=${fmt(wB.pValue, 5)}\n`);
    process.stdout.write(`  Bootstrap: mean=${fmt(bootB.mean, 3)}, 95% CI [${fmt(bootB.ci95[0], 3)}, ${fmt(bootB.ci95[1], 3)}], P(>0)=${fmt(bootB.pPos, 3)}\n`);
  }

  // Tailored absolute A and B distributions (n=19).
  const tailA = tailoredPerIssue.map((r) => r.meanA).filter((x) => x != null);
  const tailB = tailoredPerIssue.map((r) => r.meanB).filter((x) => x != null);
  const meanA_n19 = mean(tailA), meanB_n19 = mean(tailB);
  process.stdout.write(`\n=== Tailored absolute distributions (n=19) ===\n`);
  process.stdout.write(`A mean across ${tailA.length}/19 issues: ${fmt(meanA_n19, 2)} / 50\n`);
  process.stdout.write(`B mean across ${tailB.length}/19 issues: ${fmt(meanB_n19, 2)} / 50 (excludes all-pushback issues)\n`);

  process.stdout.write(`\nOutput written to ${a.output}\n`);
}

main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(1); });
