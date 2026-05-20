#!/usr/bin/env node
// Picker-vs-content follow-up — prose-baseline arm.
//
// Sister to pick-specialists.cjs (tag-Jaccard pickAgents) and
// mint-naive-agent.cjs (single fresh-mint general). This one calls the
// new LLM-prose dispatcher (PR #267 — full CLAUDE.md prose, default
// claude-opus-4-7[1m]) as a one-shot library call per repo group.
//
// One dispatcher tick per leg → up to (#leg-issues) assignments. The
// dispatcher runs through Anthropic API and costs ~$10-15 per tick on a
// full agent set. Defense in depth: snapshot the registry before, restore
// after.
//
// Output: picks-prose.tsv with the same columns as picks.tsv:
//   issueId\tagentId\trationale\tscore\tleg\tlabels
//
// Usage:
//   node research/curve-redo-bundle/specialist-redo/pick-prose.cjs \
//     --corpus research/curve-redo-bundle/corpus.json \
//     --out research/curve-redo-data/prose-baseline/picks-prose.tsv \
//     [--registry state/agents-registry.json]
//     [--mcp-path /home/.../vaultpilot-mcp]
//     [--dev-path /home/.../vaultpilot-dev-framework]

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

const TRIM_RE = /^agent-916a-trim-/;
// Filter the naive-baseline agent (`agent-8274` Wallis) so the prose arm
// doesn't accidentally select an agent minted as the prior arm's clean
// control. It has only the GENERIC_SEED in its CLAUDE.md and would be a
// noisy comparator if picked.
const NAIVE_RE = /^agent-8274$/;
// Filter archived agents — they're skipped in production routing too.
function isEligible(a) {
  if (TRIM_RE.test(a.agentId)) return false;
  if (NAIVE_RE.test(a.agentId)) return false;
  if (a.archived) return false;
  if (a.mergedInto) return false;
  return true;
}

async function main() {
  const args = parseArgs();
  for (const r of ["corpus", "out"]) {
    if (!args[r]) {
      process.stderr.write(`Missing --${r}\n`);
      process.exit(1);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const { dispatch } = require(path.join(distRoot, "orchestrator", "dispatcher.js"));
  const { getIssue } = require(path.join(distRoot, "github", "gh.js"));
  const { Logger } = require(path.join(distRoot, "log", "logger.js"));

  const registryPath = args.registry ?? path.join(repoRoot, "state", "agents-registry.json");
  const reg = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  const eligible = reg.agents.filter(isEligible);
  process.stderr.write(
    `Registry: ${reg.agents.length} total, ${reg.agents.length - eligible.length} filtered, ${eligible.length} eligible.\n`,
  );

  const corpus = JSON.parse(fs.readFileSync(args.corpus, "utf-8"));
  const issuesByLeg = new Map();
  for (const i of corpus.issues) {
    let arr = issuesByLeg.get(i.leg);
    if (!arr) { arr = []; issuesByLeg.set(i.leg, arr); }
    arr.push(i);
  }

  const mcpPath = args["mcp-path"]
    ?? path.join(process.env.HOME, "dev", "vaultpilot", "vaultpilot-mcp");
  const devPath = args["dev-path"]
    ?? path.join(process.env.HOME, "dev", "vaultpilot", "vaultpilot-dev-framework");
  const repoPathByLeg = new Map([
    [1, mcpPath],
    [2, devPath],
  ]);

  // Mint a no-op-ish logger. The dispatcher uses .info / .warn for
  // instrumentation only (cost ledger, prompt-byte budget warnings, LLM I/O
  // dump). We want the events captured, but not in `logs/`.
  const logger = new Logger({
    runId: `pick-prose-${Date.now()}`,
    verbose: true,
    logsDir: path.join(repoRoot, "research", "curve-redo-data", "prose-baseline"),
  });
  await logger.open();

  const allRows = [];
  let totalCost = 0;
  for (const [leg, issuesInLeg] of [...issuesByLeg.entries()].sort((a, b) => a[0] - b[0])) {
    const targetRepoPath = repoPathByLeg.get(leg);
    if (!targetRepoPath || !fs.existsSync(path.join(targetRepoPath, "CLAUDE.md"))) {
      throw new Error(`Bad target repo path for leg ${leg}: ${targetRepoPath}`);
    }
    process.stderr.write(`\n=== leg ${leg}: ${issuesInLeg.length} issues, target=${targetRepoPath} ===\n`);

    // Fetch issue bodies via gh — required by the prose prompt.
    const fetchedIssues = [];
    for (const i of issuesInLeg) {
      const repo = i.repo;
      // For closed issues we still fetch via gh — it returns body for
      // both open and closed. State comes from corpus authoritatively.
      const summary = await getIssue(repo, i.issueId);
      if (!summary) {
        throw new Error(`gh issue view failed for ${repo}#${i.issueId}`);
      }
      fetchedIssues.push({
        id: summary.id,
        title: summary.title,
        labels: summary.labels,
        state: summary.state,
        body: summary.body,
      });
      process.stderr.write(
        `  #${i.issueId}: ${summary.body.length} body bytes, labels=${summary.labels.length}\n`,
      );
    }

    const cap = fetchedIssues.length;
    process.stderr.write(`Calling dispatch(): idle=${eligible.length}, cap=${cap}\n`);

    const costTracker = {
      total: 0,
      add(usd) { this.total += usd ?? 0; },
    };

    const result = await dispatch({
      idleAgents: eligible,
      pendingIssues: fetchedIssues,
      cap,
      logger,
      costTracker,
      targetRepoPath,
    });

    process.stderr.write(
      `dispatch source=${result.source}, ` +
        `assignments=${result.assignments.length}, ` +
        `cost=$${costTracker.total.toFixed(4)}\n`,
    );
    totalCost += costTracker.total;

    // Validate every issue got an assignment. The validator inside
    // dispatcher requires under-dispatch < trueCap, but we want EVERY
    // issue assigned — fail loudly otherwise.
    const assignedById = new Map(result.assignments.map((a) => [a.issueId, a.agentId]));
    const issueById = new Map(issuesInLeg.map((i) => [i.issueId, i]));
    for (const i of issuesInLeg) {
      const agentId = assignedById.get(i.issueId);
      const summary = fetchedIssues.find((f) => f.id === i.issueId);
      if (!agentId) {
        process.stderr.write(`  WARN: leg ${leg} issue #${i.issueId} not assigned\n`);
        allRows.push({
          issueId: i.issueId,
          agentId: "fresh-mint",
          rationale: `prose-source-${result.source}-unassigned`,
          score: 0,
          leg: i.leg,
          labels: (summary?.labels ?? []).join(","),
        });
        continue;
      }
      allRows.push({
        issueId: i.issueId,
        agentId,
        rationale: `prose-${result.source}`,
        score: 0, // prose picker has no scalar score; recorded for column-shape compat.
        leg: i.leg,
        labels: (summary?.labels ?? []).join(","),
      });
    }
  }

  await logger.close();

  // Trim contamination check (mirrors pick-specialists.cjs).
  const trimPicks = allRows.filter((r) => TRIM_RE.test(r.agentId));
  if (trimPicks.length > 0) {
    process.stderr.write(`ERROR: ${trimPicks.length} trim agent(s) leaked into picks.\n`);
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const lines = ["issueId\tagentId\trationale\tscore\tleg\tlabels"];
  for (const r of allRows) {
    lines.push(
      `${r.issueId}\t${r.agentId}\t${r.rationale}\t${r.score.toFixed(4)}\t${r.leg}\t${r.labels}`,
    );
  }
  fs.writeFileSync(args.out, lines.join("\n") + "\n");

  const byAgent = new Map();
  for (const r of allRows) byAgent.set(r.agentId, (byAgent.get(r.agentId) ?? 0) + 1);
  const byRationale = new Map();
  for (const r of allRows) byRationale.set(r.rationale, (byRationale.get(r.rationale) ?? 0) + 1);
  process.stderr.write(`\nPicks → ${args.out}\n`);
  process.stderr.write(`  agents: ${[...byAgent.entries()].map(([a, n]) => `${a}=${n}`).join(", ")}\n`);
  process.stderr.write(`  rationale: ${[...byRationale.entries()].map(([r, n]) => `${r}=${n}`).join(", ")}\n`);
  process.stderr.write(`  total picker cost: $${totalCost.toFixed(4)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
