#!/usr/bin/env node
// Curve-redo follow-up — Step 2 of feature-plans/curve-redo-specialist-followup-plan.md.
//
// For each issue in the corpus, calls the orchestrator's pickAgents() as a
// library, with the 18 trim agents filtered out via a regOverride copy (no
// registry mutation), and writes one row to picks.tsv:
//
//   issueId\tagentId\trationale\tscore\tleg
//
// Usage:
//   node feature-plans/curve-redo-bundle/specialist-redo/pick-specialists.cjs \
//     --corpus feature-plans/curve-redo-bundle/corpus.json \
//     --out feature-plans/curve-redo-data/specialist-redo/picks.tsv \
//     [--registry state/agents-registry.json]    # default: state/agents-registry.json
//     [--target-repo szhygulin/vaultpilot-mcp]   # passed to gh issue view
//
// Reads built dist/ — run `npm run build` first.

const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

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

function fetchLabels(issueId, repo) {
  // gh issue view returns {labels:[{name,...}]}; for closed-leg issues the
  // labels may be empty or stripped. The plan's findings note 8/13 issues have
  // 0 labels — that collapse is intentional surface-area data, not a bug.
  try {
    const out = execFileSync("gh", [
      "issue",
      "view",
      String(issueId),
      "--repo",
      repo,
      "--json",
      "labels",
    ], { encoding: "utf-8" });
    const parsed = JSON.parse(out);
    return parsed.labels.map((l) => l.name);
  } catch (err) {
    process.stderr.write(`WARN: gh issue view failed for ${repo}#${issueId}: ${err.message}\n`);
    return [];
  }
}

async function main() {
  const args = parseArgs();
  const required = ["corpus", "out"];
  for (const r of required) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.stderr.write(
        "Usage: pick-specialists.cjs --corpus <path> --out <path> [--registry <path>] [--target-repo <owner/repo>]\n",
      );
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const orchestrator = require(path.join(distRoot, "orchestrator", "orchestrator.js"));
  if (typeof orchestrator.pickAgents !== "function") {
    process.stderr.write(
      "ERROR: dist/src/orchestrator/orchestrator.js does not export pickAgents — run `npm run build` first.\n",
    );
    process.exit(1);
  }

  const registryPath = args.registry ?? path.join(repoRoot, "state", "agents-registry.json");
  const reg = JSON.parse(fs.readFileSync(registryPath, "utf-8"));

  // Filter trim agents BEFORE pickAgents sees them. The trim agents share
  // agent-916a's tag set and would dominate Jaccard scores against any issue
  // they'd previously been benchmarked on. Filtering keeps them in the
  // on-disk registry (no mutation) while excluding them from this picker
  // call. Plan §"Trim contamination of picks".
  const TRIM_RE = /^agent-916a-trim-/;
  const filteredAgents = reg.agents.filter((a) => !TRIM_RE.test(a.agentId));
  const filteredCount = reg.agents.length - filteredAgents.length;
  process.stderr.write(
    `Registry: ${reg.agents.length} total agents, ${filteredCount} trim filtered, ${filteredAgents.length} eligible.\n`,
  );
  const regOverride = { ...reg, agents: filteredAgents };

  const corpus = JSON.parse(fs.readFileSync(args.corpus, "utf-8"));
  if (!Array.isArray(corpus.issues)) {
    process.stderr.write("ERROR: corpus JSON has no `issues` array.\n");
    process.exit(1);
  }

  const rows = [];
  for (const issue of corpus.issues) {
    const repo = args["target-repo"] ?? issue.repo;
    if (!repo) {
      process.stderr.write(
        `ERROR: corpus entry for issue #${issue.issueId} has no repo and no --target-repo override.\n`,
      );
      process.exit(1);
    }
    const labels = fetchLabels(issue.issueId, repo);
    const issueSummary = {
      id: issue.issueId,
      title: issue.title ?? "",
      labels,
      // pickAgents accepts both open and closed; state isn't part of the
      // scoring formula. Closed-leg issues run via --replay-base-sha at
      // dispatch time. Use the corpus value verbatim.
      state: issue.state ?? "open",
    };
    const result = orchestrator.pickAgents({
      reg: regOverride,
      pendingIssues: [issueSummary],
      maxParallelism: 1,
    });
    if (result.reusedAgents.length === 0) {
      // pickAgents returns no agents when the cap is 0 OR no issues are
      // pending OR the registry is empty. With cap=1 and one issue, this
      // means newAgentsToMint=1 — record the fresh-mint intent.
      rows.push({
        issueId: issue.issueId,
        agentId: "fresh-mint",
        rationale: "fresh-general",
        score: 0,
        leg: issue.leg,
        labels: labels.join(","),
      });
      continue;
    }
    const picked = result.reusedAgents[0];
    rows.push({
      issueId: issue.issueId,
      agentId: picked.agent.agentId,
      rationale: picked.rationale,
      score: picked.score,
      leg: issue.leg,
      labels: labels.join(","),
    });
  }

  // Plan §"Trim contamination" — assert no trim agent slipped through.
  const trimPicks = rows.filter((r) => TRIM_RE.test(r.agentId));
  if (trimPicks.length > 0) {
    process.stderr.write(
      `ERROR: ${trimPicks.length} trim agent(s) leaked into picks. regOverride filter is broken.\n`,
    );
    for (const r of trimPicks) {
      process.stderr.write(`  issue #${r.issueId} → ${r.agentId}\n`);
    }
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const lines = ["issueId\tagentId\trationale\tscore\tleg\tlabels"];
  for (const r of rows) {
    lines.push(
      `${r.issueId}\t${r.agentId}\t${r.rationale}\t${r.score.toFixed(4)}\t${r.leg}\t${r.labels}`,
    );
  }
  fs.writeFileSync(args.out, lines.join("\n") + "\n");

  // Distribution stderr-summary — mirrors the verification check in the plan.
  const byAgent = new Map();
  for (const r of rows) {
    byAgent.set(r.agentId, (byAgent.get(r.agentId) ?? 0) + 1);
  }
  const byRationale = new Map();
  for (const r of rows) {
    byRationale.set(r.rationale, (byRationale.get(r.rationale) ?? 0) + 1);
  }
  process.stderr.write(`\nPicks → ${args.out}\n`);
  process.stderr.write(`  agents: ${[...byAgent.entries()].map(([a, n]) => `${a}=${n}`).join(", ")}\n`);
  process.stderr.write(`  rationale: ${[...byRationale.entries()].map(([r, n]) => `${r}=${n}`).join(", ")}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
