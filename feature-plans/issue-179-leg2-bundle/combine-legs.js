#!/usr/bin/env node
// Combine leg 1 + leg 2 cell logs into a single K=13 dataset, fit linear-log
// curves on it, write the combined output. Run this after both legs finish.
//
// Usage:
//   node feature-plans/issue-179-leg2-bundle/combine-legs.js \
//     <leg1-logs-dir> <leg2-logs-dir> <agents-spec.json> <output.json>
//
// The agents-spec is used only for the agentId → sizeBytes map; either
// agents-spec-phase3-dev.json or agents-spec-phase3-mcp.json works since both
// reference the same 18 trim agents (each with the same sizeBytes across legs).
//
// Reads built dist/ — run `npm run build` first.

const path = require("node:path");
const fs = require("node:fs");

async function main() {
  const [leg1Logs, leg2Logs, agentsSpecPath, outputPath] = process.argv.slice(2);
  if (!leg1Logs || !leg2Logs || !agentsSpecPath || !outputPath) {
    console.error(
      "Usage: node combine-legs.js <leg1-logs-dir> <leg2-logs-dir> <agents-spec.json> <output.json>",
    );
    process.exit(1);
  }
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src", "research", "curveStudy");
  const { aggregateLogsDir } = require(path.join(distRoot, "aggregate.js"));
  const { scoreAllAgents } = require(path.join(distRoot, "score.js"));
  const { samplesFromScores, samplesFromCost } = require(path.join(distRoot, "fit.js"));
  const { fitPolynomialRegression } = require(path.join(distRoot, "regression.js"));

  const spec = JSON.parse(fs.readFileSync(agentsSpecPath, "utf8"));
  const sizes = new Map();
  for (const a of spec) sizes.set(a.devAgentId, a.sizeBytes);

  const cells1 = await aggregateLogsDir({ logsDir: leg1Logs, prefix: "curveStudy-", agentSizes: sizes });
  const cells2 = await aggregateLogsDir({ logsDir: leg2Logs, prefix: "curveStudy-", agentSizes: sizes });
  const allCells = [...cells1, ...cells2];
  if (allCells.length === 0) {
    console.error("No cells aggregated. Check log paths + filename pattern (curveStudy-<agentId>-<issue>.log).");
    process.exit(1);
  }

  const scores = scoreAllAgents(allCells);
  const accuracy = samplesFromScores(scores);
  const completed = allCells
    .filter((c) => c.decision === "implement" || c.decision === "pushback")
    .map((c) => ({ agentId: c.agentId, agentSizeBytes: c.agentSizeBytes, costUsd: c.costUsd }));
  const tokenCost = samplesFromCost(completed);
  const accFit = accuracy.length > 1 ? fitPolynomialRegression(accuracy, 1, "log") : null;
  const tcFit = tokenCost.length > 1 ? fitPolynomialRegression(tokenCost, 1, "log") : null;

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cellCount: allCells.length,
        perLeg: { leg1: cells1.length, leg2: cells2.length },
        scores,
        accuracy: { samples: accuracy, regression: accFit },
        tokenCost: { samples: tokenCost, regression: tcFit },
      },
      null,
      2,
    ),
  );
  console.log(`Combined ${allCells.length} cells (leg1=${cells1.length}, leg2=${cells2.length}) → ${outputPath}`);
  if (accFit) {
    const sig = accFit.significance;
    console.log(
      `ACCURACY: n=${accFit.n}, R²=${accFit.rSquared.toFixed(4)}, F(${sig.fDfRegression},${sig.fDfResidual})=${sig.fStatistic.toFixed(2)}, p=${sig.fPValue.toExponential(3)}`,
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
