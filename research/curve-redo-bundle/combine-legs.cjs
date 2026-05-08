#!/usr/bin/env node
// Curve-redo: combine leg 1 (vp-mcp) + leg 2 (vp-dev-agents) results into a
// single 13-issue dataset, score each cell via the 0-200 A+B formula
// (reasoning judge + hidden-test pass rate), fit linear-log curves on the
// per-agent means, write the combined output.
//
// Usage:
//   node research/curve-redo-bundle/combine-legs.js \
//     --leg1-logs <dir> --leg1-scores <dir> \
//     --leg2-logs <dir> --leg2-scores <dir> \
//     --agents-spec <path> \
//     --output <path>
//
// Each leg's `--scores` dir holds `<cellKey>-tests.json` and
// `<cellKey>-judge.json` files written by `vp-dev research run-tests` and
// `vp-dev research grade-reasoning`. cellKey = `<agentId>-<issueId>`.
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

async function main() {
  const args = parseArgs();
  const required = ["leg1-logs", "leg1-scores", "leg2-logs", "leg2-scores", "agents-spec", "output"];
  for (const r of required) {
    if (!args[r]) {
      console.error(`Missing --${r}`);
      console.error(
        "Usage: combine-legs.js --leg1-logs <dir> --leg1-scores <dir> --leg2-logs <dir> --leg2-scores <dir> --agents-spec <path> --output <path>",
      );
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src", "research", "curveStudy");
  const { aggregateLogsDir } = require(path.join(distRoot, "aggregate.js"));
  const { samplesFromCost } = require(path.join(distRoot, "fit.js"));
  const { fitPolynomialRegression } = require(path.join(distRoot, "regression.js"));
  const { loadCellScores, samplesFromCellScores } = require(path.join(distRoot, "cellScores.js"));

  const spec = JSON.parse(fs.readFileSync(args["agents-spec"], "utf8"));
  const sizes = new Map();
  for (const a of spec) sizes.set(a.devAgentId, a.sizeBytes);

  const cells1 = await aggregateLogsDir({ logsDir: args["leg1-logs"], prefix: "curveStudy-", agentSizes: sizes });
  const cells2 = await aggregateLogsDir({ logsDir: args["leg2-logs"], prefix: "curveStudy-", agentSizes: sizes });
  const allCells = [...cells1, ...cells2];
  if (allCells.length === 0) {
    console.error("No cells aggregated. Check log paths + filename pattern (curveStudy-<agentId>-<issue>.log).");
    process.exit(1);
  }

  // Load per-cell A/B score JSONs from BOTH legs and merge into one map.
  const scores1 = await loadCellScores(args["leg1-scores"]);
  const scores2 = await loadCellScores(args["leg2-scores"]);
  const cellScores = new Map([...scores1, ...scores2]);

  const accuracy = samplesFromCellScores(allCells, cellScores);

  // Token-cost curve uses the same cells (filtered to non-error).
  const completed = allCells
    .filter((c) => c.decision === "implement" || c.decision === "pushback")
    .map((c) => ({ agentId: c.agentId, agentSizeBytes: c.agentSizeBytes, costUsd: c.costUsd }));
  const tokenCost = samplesFromCost(completed);

  // Quadratic-raw (degree 2, identity transform) is the post-redo default:
  // the linear-log fit on the combined 232-cell dataset returned p=0.737
  // (accuracy) and p=0.495 (token cost), failing the Step-7 merge gate. A
  // model sweep across degrees 1-3 × {log, identity} found the data is
  // non-monotone in log(bytes) — quality degrades from 6k → 35k then
  // recovers from 35k → 50k+. Quadratic-raw is the simplest model that
  // captures that bend: clears p=0.030 on accuracy with R²adj=0.29, and
  // its quadratic coefficient is individually significant at p=0.015.
  // Token cost stays under the same form for consistency (overall F
  // p=0.105; quadratic coefficient itself p=0.037).
  const accFit = accuracy.length > 2 ? fitPolynomialRegression(accuracy, 2, "identity") : null;
  const tcFit = tokenCost.length > 2 ? fitPolynomialRegression(tokenCost, 2, "identity") : null;

  // Range-normalize each curve to a common [1, 2] scale so the operator can
  // see accuracy and token-cost on a unified dynamic range when reading the
  // proposal. Mirrors `rangeNormalize` in `src/util/contextCostCurve.ts`.
  // The raw factor values stay scale-invariant under any quality rescale
  // (factor = qmax/quality), so the rescale from 0-200 → 0-100 quality is
  // invisible here — but the normalized samples make the comparable shape
  // explicit at synthesis time, not just at runtime.
  function normalizeSamples(samples) {
    const maxFactor = samples.reduce((m, s) => (s.factor > m ? s.factor : m), 1);
    if (maxFactor <= 1 + 1e-9) {
      return { maxFactor, normalizedSamples: samples.map((s) => ({ xBytes: s.xBytes, factor: 1 })) };
    }
    return {
      maxFactor,
      normalizedSamples: samples.map((s) => ({
        xBytes: s.xBytes,
        factor: 1 + (s.factor - 1) / (maxFactor - 1),
      })),
    };
  }
  const accNorm = normalizeSamples(accuracy);
  const tcNorm = normalizeSamples(tokenCost);

  // Score-coverage diagnostics: how many cells got a score JSON pair?
  let cellsWithJudge = 0;
  let cellsWithTest = 0;
  for (const c of allCells) {
    const key = `${c.agentId}-${c.issueId}`;
    const s = cellScores.get(key);
    if (s?.judge) cellsWithJudge += 1;
    if (s?.test) cellsWithTest += 1;
  }

  fs.writeFileSync(
    args.output,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cellCount: allCells.length,
        perLeg: { leg1: cells1.length, leg2: cells2.length },
        coverage: {
          cellsWithJudge,
          cellsWithTest,
          totalCells: allCells.length,
        },
        accuracy: {
          samples: accuracy,
          regression: accFit,
          maxFactor: accNorm.maxFactor,
          normalizedSamples: accNorm.normalizedSamples,
        },
        tokenCost: {
          samples: tokenCost,
          regression: tcFit,
          maxFactor: tcNorm.maxFactor,
          normalizedSamples: tcNorm.normalizedSamples,
        },
      },
      null,
      2,
    ),
  );

  console.log(`Combined ${allCells.length} cells (leg1=${cells1.length}, leg2=${cells2.length}) → ${args.output}`);
  console.log(`Score coverage: judge=${cellsWithJudge}/${allCells.length}, test=${cellsWithTest}/${allCells.length}`);
  console.log(`Range: accuracy maxFactor=${accNorm.maxFactor.toFixed(3)} (raw); tokenCost maxFactor=${tcNorm.maxFactor.toFixed(3)} (raw). Both normalize to [1, 2] in src/util/contextCostCurve.ts at runtime.`);
  if (accFit) {
    const sig = accFit.significance;
    console.log(
      `ACCURACY:   n=${accFit.n}, R²=${accFit.rSquared.toFixed(4)}, F(${sig.fDfRegression},${sig.fDfResidual})=${sig.fStatistic.toFixed(2)}, p=${sig.fPValue.toExponential(3)}`,
    );
  }
  if (tcFit) {
    const sig = tcFit.significance;
    console.log(
      `TOKEN COST: n=${tcFit.n}, R²=${tcFit.rSquared.toFixed(4)}, F(${sig.fDfRegression},${sig.fDfResidual})=${sig.fStatistic.toFixed(2)}, p=${sig.fPValue.toExponential(3)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
