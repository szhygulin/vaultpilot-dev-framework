#!/usr/bin/env node
// Super-agent curve fit + AIC sweep — Phase E of
// feature-plans/super-agent-curve-experiment-plan.md.
//
// Steps:
//   1. Load per-cell QualityScores from every leg's `scores/` directory under
//      research/curve-redo-data/super-agent/leg<N>/scores/. The decision,
//      isError flag, and costUsd are parsed from each cell's spawn log
//      envelope (`research/curve-redo-data/super-agent/leg<N>/logs/`).
//   2. Compute per-cell quality via `qualityFromAB` from
//      dist/src/research/curveStudy/cellScores.js (the same 0..100 formula
//      curve-redo's combiner uses; see cellScores.ts:143).
//   3. Project to three parallel per-trim aggregates with xBytes = trim size:
//        - quality axis: factor = mean Q across the corpus issues
//        - error axis:   factor = error rate (cells with isError / cellCount)
//        - cost axis:    factor = mean cell cost in USD
//      The three axes share the same machinery so the writeup can compare
//      them on identical x-axes without re-running the experiment.
//   4. Fit all 6 candidate forms (degree {1,2,3} × xTransform {identity, log})
//      per axis. AIC = n·ln(rss/n) + 2·(degree+1); pick min-AIC, report ΔAIC
//      for the rest.
//   5. Leave-out-N-outliers refit (N=1, then N=2) per axis: rank samples by
//      |residual| under the winning form, drop top, refit, recompute p. If p
//      drops by >1 order of magnitude, the dropped seeds are absorbing
//      variance — surface them in the writeup.
//   6. Per-leg sanity sub-fit per axis: also fit each leg's slice in isolation.
//      Wildly-different residuals in one leg flag possibly-defective seeds.
//
// Output JSON shape: top-level `qualityAxis`, `errorAxis`, `costAxis` blocks
// each carry `{samples, aicTable, winningForm, winningRegression,
// leaveOutRefits, perLegFits}`. Legacy top-level fields (`perAgentSamples`,
// `aicTable`, `winningRegression`, etc.) are retained as aliases for the
// quality axis so any pre-existing consumer keeps working.
//
// Note on size=0: `xTransform="log"` requires xBytes > 0. Samples at size=0
// (the 0KB trim) are excluded from log-x fits BUT included in identity-x
// fits — the AIC table notes the n delta per form so the comparison is fair
// (different n means different rss-scale; AIC-vs-AIC across different n is
// loose but the comparison is per-form).
//
// Usage:
//   npm run build && node research/curve-redo-bundle/super-agent/combine-super-curve.cjs

"use strict";

const path = require("node:path");
const fs = require("node:fs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DIST = path.join(REPO_ROOT, "dist", "src");
const OUT_DIR = path.join(REPO_ROOT, "research", "curve-redo-data", "super-agent");
const LEGS_PATH = path.join(OUT_DIR, "legs.json");
const RESULT_PATH = path.join(OUT_DIR, "super-agent-curve.json");

function requireDist(rel) {
  const p = path.join(DIST, rel);
  if (!fs.existsSync(p)) {
    process.stderr.write(`ERROR: ${p} missing — run \`npm run build\` first.\n`);
    process.exit(1);
  }
  return require(p);
}

function extractEnvelope(text) {
  // Mirrors curveStudy/aggregate.ts:extractEnvelope. Walks `\n{\n` / `{\n`
  // anchors backwards until a JSON.parse succeeds.
  for (const anchor of ["\n{\n", "{\n"]) {
    let idx = text.lastIndexOf(anchor);
    while (idx >= 0) {
      const candidate = text.slice(idx).replace(/^\s+/, "");
      try {
        return JSON.parse(candidate);
      } catch (_e) {
        // try the next-earlier anchor
      }
      idx = text.lastIndexOf(anchor, idx - 1);
    }
  }
  return null;
}

function readDecisionFromLog(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const text = fs.readFileSync(logPath, "utf-8");
  const obj = extractEnvelope(text);
  if (!obj || !obj.envelope) return null;
  return obj.envelope.decision || null;
}

function readCellMetaFromLog(logPath) {
  // Returns { decision, isError, costUsd } from the spawn-log envelope, or
  // nulls when the log is missing / unparseable. Decision lives inside
  // envelope.decision (matches readDecisionFromLog); isError + costUsd are
  // top-level fields of the outer envelope object written by vp-dev spawn.
  const out = { decision: null, isError: null, costUsd: null };
  if (!fs.existsSync(logPath)) return out;
  const text = fs.readFileSync(logPath, "utf-8");
  const obj = extractEnvelope(text);
  if (!obj) return out;
  if (obj.envelope && obj.envelope.decision) out.decision = obj.envelope.decision;
  if (typeof obj.isError === "boolean") out.isError = obj.isError;
  if (typeof obj.costUsd === "number") out.costUsd = obj.costUsd;
  return out;
}

async function main() {
  if (!fs.existsSync(LEGS_PATH)) {
    process.stderr.write(`ERROR: legs.json missing at ${LEGS_PATH} — run build-super-trims.cjs first.\n`);
    process.exit(2);
  }
  const legsJson = JSON.parse(fs.readFileSync(LEGS_PATH, "utf-8"));
  const cellScoresMod = requireDist(path.join("research", "curveStudy", "cellScores.js"));
  const regressionMod = requireDist(path.join("research", "curveStudy", "regression.js"));

  const trimById = new Map(legsJson.trims.map((t) => [t.agentId, t]));

  // Walk each leg's scores/ dir and rebuild Cells. Each leg's logs/ dir is
  // the source of truth for `decision`; scores/ holds the test+judge JSONs.
  const cells = [];
  let legsRead = 0;
  for (const leg of legsJson.legs) {
    const legDir = path.join(OUT_DIR, `leg${leg.legNumber}`);
    const logsDir = path.join(legDir, "logs");
    const scoresDir = path.join(legDir, "scores");
    if (!fs.existsSync(logsDir)) continue;
    legsRead++;
    const scoreMap = await cellScoresMod.loadCellScores(scoresDir);
    const logFiles = fs.readdirSync(logsDir).filter((f) => f.endsWith(".log"));
    for (const f of logFiles) {
      const m = /^curveStudy-(agent-[a-z0-9-]+)-(\d+)\.log$/.exec(f);
      if (!m) continue;
      const agentId = m[1];
      const issueId = Number(m[2]);
      const trim = trimById.get(agentId);
      if (!trim) continue;
      const meta = readCellMetaFromLog(path.join(logsDir, f));
      const key = `${agentId}-${issueId}`;
      const scores = scoreMap.get(key);
      const quality = cellScoresMod.qualityFromAB({
        decision: meta.decision,
        judge: scores?.judge,
        test: scores?.test,
      });
      cells.push({
        legNumber: leg.legNumber,
        agentId,
        issueId,
        sizeBytes: trim.sizeBytes,
        decision: meta.decision,
        isError: meta.isError === true,
        costUsd: typeof meta.costUsd === "number" ? meta.costUsd : 0,
        quality,
      });
    }
  }

  if (cells.length === 0) {
    process.stderr.write("ERROR: no cells loaded — dispatch + score must run first.\n");
    process.exit(3);
  }
  process.stderr.write(`[combine-super-curve] cells loaded: ${cells.length} (${legsRead}/${legsJson.legs.length} legs read)\n`);

  // Per-trim aggregation: collect per-cell quality, isError, costUsd into
  // three parallel axes (quality, errorRate, meanCost). Plan uses raw mean
  // values so axis coefficients sit in their natural units.
  const perAgent = new Map();
  for (const c of cells) {
    let bucket = perAgent.get(c.agentId);
    if (!bucket) {
      bucket = {
        sizeBytes: c.sizeBytes,
        legNumber: c.legNumber,
        qualities: [],
        errors: [],
        costs: [],
      };
      perAgent.set(c.agentId, bucket);
    }
    bucket.qualities.push(c.quality);
    bucket.errors.push(c.isError ? 1 : 0);
    bucket.costs.push(c.costUsd);
  }
  const samples = [];          // quality axis (factor = mean Q in 0..100)
  const errorSamples = [];     // error axis (factor = error rate in 0..1)
  const costSamples = [];      // cost axis (factor = mean cell cost in $)
  for (const [agentId, b] of perAgent.entries()) {
    const cellCount = b.qualities.length;
    const meanQ = b.qualities.reduce((s, x) => s + x, 0) / cellCount;
    const errorRate = b.errors.reduce((s, x) => s + x, 0) / cellCount;
    const meanCost = b.costs.reduce((s, x) => s + x, 0) / cellCount;
    const base = { agentId, legNumber: b.legNumber, xBytes: b.sizeBytes, cellCount };
    samples.push({ ...base, factor: meanQ });
    errorSamples.push({ ...base, factor: errorRate });
    costSamples.push({ ...base, factor: meanCost });
  }
  samples.sort((a, b) => a.xBytes - b.xBytes);
  errorSamples.sort((a, b) => a.xBytes - b.xBytes);
  costSamples.sort((a, b) => a.xBytes - b.xBytes);

  process.stderr.write(`[combine-super-curve] per-trim samples: ${samples.length} (quality + error + cost axes)\n`);

  // Fit the 6 forms; for log-x exclude xBytes <= 0.
  const forms = [
    { degree: 1, xTransform: "identity" },
    { degree: 1, xTransform: "log" },
    { degree: 2, xTransform: "identity" },
    { degree: 2, xTransform: "log" },
    { degree: 3, xTransform: "identity" },
    { degree: 3, xTransform: "log" },
  ];

  function aicFromReg(reg) {
    // AIC = n · ln(rss/n) + 2 · (degree+1)
    if (!(reg.rss > 0)) return Number.NaN;
    return reg.n * Math.log(reg.rss / reg.n) + 2 * (reg.degree + 1);
  }

  function fitOne(form, sampleSet) {
    const usable = form.xTransform === "log"
      ? sampleSet.filter((s) => s.xBytes > 0)
      : sampleSet;
    if (usable.length <= form.degree + 1) return null;
    try {
      const reg = regressionMod.fitPolynomialRegression(usable, form.degree, form.xTransform);
      const aic = aicFromReg(reg);
      return { form, n: usable.length, aic, reg };
    } catch (err) {
      return { form, n: usable.length, aic: NaN, reg: null, error: String(err.message || err) };
    }
  }

  function residualsForReg(reg, sampleSet) {
    return sampleSet.map((s) => {
      const yhat = regressionMod.evaluatePolynomial(reg, s.xBytes);
      return { ...s, yhat, residual: s.factor - yhat };
    });
  }

  // runAxisFit: Phase E pipeline applied to one (label, sampleSet) pair —
  // 6-form AIC sweep, leave-out-N-outliers refit, per-leg sanity sub-fit.
  // Returns the same shape regardless of axis so the writeup can iterate
  // axes uniformly. `kind` is "quality" | "error" | "cost" — used for log
  // labelling and for the writeup to interpret the axis units.
  function runAxisFit(kind, axisSamples) {
    const fits = forms.map((f) => fitOne(f, axisSamples)).filter((r) => r);
    const valid = fits.filter((r) => Number.isFinite(r.aic));
    if (valid.length === 0) {
      process.stderr.write(`[combine-super-curve][${kind}] no fits produced finite AIC — too few samples or zero variance.\n`);
      return { kind, samples: axisSamples, aicTable: [], winningForm: null, winningRegression: null, leaveOutRefits: [], perLegFits: [] };
    }
    valid.sort((a, b) => a.aic - b.aic ||
      a.form.degree - b.form.degree ||
      (a.form.xTransform === "identity" ? -1 : 1));
    const winner = valid[0];
    const aicTable = valid.map((r) => ({
      form: r.form,
      n: r.n,
      aic: r.aic,
      deltaAic: r.aic - winner.aic,
      rSquared: r.reg.rSquared,
      rSquaredAdjusted: r.reg.rSquaredAdjusted,
      fPValue: r.reg.significance.fPValue,
    }));

    process.stderr.write(`[combine-super-curve][${kind}] winning form: degree=${winner.form.degree} x=${winner.form.xTransform} AIC=${winner.aic.toFixed(2)} R²=${winner.reg.rSquared.toFixed(3)} p=${winner.reg.significance.fPValue.toExponential(2)}\n`);
    for (const row of aicTable) {
      process.stderr.write(`  d=${row.form.degree} x=${row.form.xTransform.padEnd(8)} n=${row.n} AIC=${row.aic.toFixed(2)} ΔAIC=${row.deltaAic.toFixed(2)} R²=${row.rSquared.toFixed(3)} adjR²=${row.rSquaredAdjusted.toFixed(3)} p=${row.fPValue.toExponential(2)}\n`);
    }

    // Leave-out-N-outliers refit under the winning form.
    const winnerSamples = winner.form.xTransform === "log"
      ? axisSamples.filter((s) => s.xBytes > 0)
      : axisSamples;
    const winnerResid = residualsForReg(winner.reg, winnerSamples);
    const sortedByAbsResid = [...winnerResid].sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
    const refits = [];
    for (const N of [1, 2]) {
      const dropAgents = new Set(sortedByAbsResid.slice(0, N).map((s) => s.agentId));
      const remaining = winnerSamples.filter((s) => !dropAgents.has(s.agentId));
      const fit = fitOne(winner.form, remaining);
      if (!fit || !fit.reg) continue;
      refits.push({
        n: N,
        droppedAgents: Array.from(dropAgents),
        droppedResiduals: sortedByAbsResid.slice(0, N).map((s) => ({ agentId: s.agentId, residual: s.residual, factor: s.factor, xBytes: s.xBytes })),
        reg: fit.reg,
        aic: fit.aic,
        pValue: fit.reg.significance.fPValue,
      });
      process.stderr.write(`[combine-super-curve][${kind}] leave-out-${N}: dropped=${Array.from(dropAgents).join(", ")} new p=${fit.reg.significance.fPValue.toExponential(2)} R²=${fit.reg.rSquared.toFixed(3)}\n`);
    }
    const winnerP = winner.reg.significance.fPValue;
    for (const rf of refits) {
      if (Number.isFinite(winnerP) && Number.isFinite(rf.pValue)) {
        const ratio = winnerP / rf.pValue;
        if (ratio > 10) {
          process.stderr.write(`  ⚠ [${kind}] leave-out-${rf.n}: p dropped by ${ratio.toFixed(0)}× — outliers absorbing variance, name them in writeup.\n`);
        }
      }
    }

    // Per-leg sanity sub-fit. fitOne can return either null (insufficient
    // samples) or {reg: null, error: ...} when the underlying regression
    // throws (singular matrix on a degenerate slice — e.g. degree-3 fit on
    // a single leg's 6 samples). Both shapes record the leg as "fit failed"
    // rather than crash the whole combiner.
    const perLegFits = [];
    for (const leg of legsJson.legs) {
      const legSamples = axisSamples.filter((s) => s.legNumber === leg.legNumber);
      const fit = fitOne(winner.form, legSamples);
      if (!fit) {
        perLegFits.push({ legNumber: leg.legNumber, n: legSamples.length, error: "insufficient samples" });
        continue;
      }
      if (!fit.reg) {
        perLegFits.push({ legNumber: leg.legNumber, n: fit.n, error: fit.error || "fit failed" });
        continue;
      }
      perLegFits.push({
        legNumber: leg.legNumber,
        n: fit.n,
        aic: fit.aic,
        rSquared: fit.reg.rSquared,
        residualStdError: fit.reg.significance.residualStdError,
        pValue: fit.reg.significance.fPValue,
      });
    }

    return {
      kind,
      samples: axisSamples,
      aicTable,
      winningForm: winner.form,
      winningRegression: winner.reg,
      leaveOutRefits: refits,
      perLegFits,
    };
  }

  const qualityAxis = runAxisFit("quality", samples);
  const errorAxis = runAxisFit("error", errorSamples);
  const costAxis = runAxisFit("cost", costSamples);

  // By-size summaries (no fit machinery — these collapse seeds within a size
  // for at-a-glance inspection in the writeup, matching the operator's
  // mental model of "what does N bytes get us?").
  function bySizeSummary(axisSamples) {
    const groups = new Map();
    for (const s of axisSamples) {
      let g = groups.get(s.xBytes);
      if (!g) { g = []; groups.set(s.xBytes, g); }
      g.push(s.factor);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([xBytes, vals]) => {
        const n = vals.length;
        const mean = vals.reduce((s, x) => s + x, 0) / n;
        const variance = n > 1 ? vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
        return {
          xBytes,
          n,
          mean,
          stdev: Math.sqrt(variance),
          min: Math.min(...vals),
          max: Math.max(...vals),
        };
      });
  }

  const result = {
    builtAt: new Date().toISOString(),
    cellsLoaded: cells.length,
    legsRead,
    // Back-compat: legacy top-level `perAgentSamples` / `aicTable` /
    // `winningForm` / `winningRegression` / `leaveOutRefits` / `perLegFits`
    // retained for any consumer that pre-dates the multi-axis output.
    perAgentSamples: qualityAxis.samples,
    aicTable: qualityAxis.aicTable,
    winningForm: qualityAxis.winningForm,
    winningRegression: qualityAxis.winningRegression,
    leaveOutRefits: qualityAxis.leaveOutRefits,
    perLegFits: qualityAxis.perLegFits,
    // New multi-axis structure:
    qualityAxis,
    errorAxis,
    costAxis,
    bySize: {
      quality: bySizeSummary(samples),
      error: bySizeSummary(errorSamples),
      cost: bySizeSummary(costSamples),
    },
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
  process.stderr.write(`[combine-super-curve] wrote ${RESULT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
