#!/usr/bin/env node
// Mint a fresh general agent for the picker-vs-content experiment Phase A
// (feature-plans/picker-vs-content-experiment-plan.md).
//
// Why this script: `vp-dev spawn --agent new` mints AND dispatches in one
// step, but for this experiment we need ONE agent reused across all 39 cells
// (one mint, then 39 picks pinned to that agent ID). This script mints
// without dispatching, writes the GENERIC_SEED to the per-agent CLAUDE.md
// (rather than copying a target-repo CLAUDE.md), and prints the agent ID.
//
// Usage:
//   node research/curve-redo-bundle/specialist-redo/mint-naive-agent.cjs
//
// Output: prints the new agent ID on stdout.
//
// Reads built dist/ — run `npm run build` first.

const path = require("node:path");
const fs = require("node:fs");

async function main() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const distRoot = path.join(repoRoot, "dist", "src");
  const registryMod = require(path.join(distRoot, "state", "registry.js"));
  const specMod = require(path.join(distRoot, "agent", "specialization.js"));

  if (typeof registryMod.mutateRegistry !== "function" || typeof registryMod.createAgent !== "function") {
    process.stderr.write("ERROR: dist/src/state/registry.js missing exports — run `npm run build` first.\n");
    process.exit(1);
  }
  if (typeof specMod.agentClaudeMdPath !== "function") {
    process.stderr.write("ERROR: dist/src/agent/specialization.js missing agentClaudeMdPath — run `npm run build` first.\n");
    process.exit(1);
  }

  // GENERIC_SEED is a private const inside specialization.ts — reproduce it
  // verbatim here so the naive agent's CLAUDE.md is the literal seed, not a
  // forked copy of a target-repo CLAUDE.md (which forkClaudeMd would do if
  // we passed it a real targetRepoPath).
  const GENERIC_SEED = `# Project rules (default seed)

The target repository did not ship a CLAUDE.md, so this short generic
seed is used. Edit \`agents/<agent-id>/CLAUDE.md\` to extend per-agent
specialization, or add a \`CLAUDE.md\` to the target repo to give every
fresh agent better starting rules.

## Git/PR Workflow
- PR-based always. Never push to main.
- Sync with origin/main before starting any work.
- Branch every new PR off origin/main — never stack PRs.
- \`--force-with-lease\` only on feature branches; never plain \`--force\`,
  never on main.
- PR body must use \`Closes #N\` on its own line for GitHub auto-close.

## Code Discipline
- Architecturally best-fitting change. Match scope to the problem's structural shape — don't paper over a structural issue with an inline patch, and don't over-engineer a localized bug.
- Trust framework guarantees — don't add error handling for impossible cases.
- Default to no comments. Only add when WHY is non-obvious.

## Issue Analysis
- Read both the issue body AND its comments before deciding scope.

## Tool Usage
- Don't repeat the same informational tool call within a single turn.
- Verify build + tests pass locally before opening a PR.
`;

  const fresh = await registryMod.mutateRegistry((reg) => registryMod.createAgent(reg));
  const claudeMdPath = specMod.agentClaudeMdPath(fresh.agentId);
  fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
  fs.writeFileSync(claudeMdPath, GENERIC_SEED);

  process.stderr.write(`Minted naive agent: ${fresh.agentId} (${fresh.name})\n`);
  process.stderr.write(`  CLAUDE.md: ${claudeMdPath} (${Buffer.byteLength(GENERIC_SEED, "utf-8")} bytes, GENERIC_SEED only)\n`);
  process.stderr.write(`  tags: ${JSON.stringify(fresh.tags)}\n`);
  process.stdout.write(fresh.agentId + "\n");
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
