import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBenchDispatch, type BenchCellSpec } from "./dispatch.js";
import type { AgentRegistryFile } from "../../types.js";

const FIXTURE_REGISTRY: AgentRegistryFile = {
  agents: [
    {
      agentId: "agent-2a3d",
      name: "Sofia",
      tags: ["solana", "marginfi", "oracle-setup"],
      createdAt: "2026-04-01T00:00:00Z",
      lastActiveAt: "2026-05-01T00:00:00Z",
      issuesHandled: 5,
      implementCount: 2,
      pushbackCount: 2,
      errorCount: 1,
    },
    {
      agentId: "agent-da91",
      name: "Tu",
      tags: ["chore", "deps", "sdk-error-shape"],
      createdAt: "2026-04-01T00:00:00Z",
      lastActiveAt: "2026-05-01T00:00:00Z",
      issuesHandled: 3,
      implementCount: 1,
      pushbackCount: 1,
      errorCount: 1,
    },
    {
      agentId: "agent-200f",
      name: "Shannon",
      tags: ["general"],
      createdAt: "2026-04-01T00:00:00Z",
      lastActiveAt: "2026-05-01T00:00:00Z",
      issuesHandled: 10,
      implementCount: 5,
      pushbackCount: 3,
      errorCount: 2,
    },
  ],
};

// Helper: build a synthetic spawn log so the cost-tracking branch reads
// real values (and so the aggregator could parse it later).
async function writeSyntheticLog(
  logPath: string,
  costUsd: number,
  decision: string,
): Promise<void> {
  const log = `> npm run vp-dev\n\n{\n  "envelope": {\n    "decision": "${decision}",\n    "reason": "test"\n  },\n  "costUsd": ${costUsd},\n  "durationMs": 1000\n}\n`;
  await fs.writeFile(logPath, log);
}

test("runBenchDispatch: picks per-issue, replicates K times, names log files canonically", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-dispatch-test-"));
  try {
    const captured: BenchCellSpec[] = [];
    const result = await runBenchDispatch({
      issueIds: [156, 162],
      targetRepo: "szhygulin/vaultpilot-mcp",
      clonePath: "/tmp/fake-clone",
      replicates: 3,
      logsDir: dir,
      cwd: process.cwd(),
      regOverride: FIXTURE_REGISTRY,
      fetchIssueLabels: async (issueId) => {
        if (issueId === 156) return ["solana", "marginfi"];
        if (issueId === 162) return ["chore", "deps"];
        return [];
      },
      spawnCell: async (spec, logPath) => {
        captured.push(spec);
        await writeSyntheticLog(logPath, 0.5, "implement");
        return { rc: 0 };
      },
    });
    // 2 issues × 3 replicates = 6 cells
    assert.equal(result.cells.length, 6);
    assert.equal(captured.length, 6);
    // Picks happened per-issue
    assert.equal(result.picks.length, 2);
    // Log filenames follow `bench-r{N}-<agentId>-<issueId>.log`
    for (const cell of result.cells) {
      const filename = path.basename(cell.logPath);
      assert.match(
        filename,
        /^bench-r[123]-agent-[a-z0-9-]+-\d+\.log$/,
        `unexpected log filename: ${filename}`,
      );
    }
    // No budget exhaustion since we didn't pass a cap
    assert.equal(result.budgetExhausted, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("runBenchDispatch: budget exhaustion halts further dispatches + reports the flag", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-dispatch-budget-"));
  try {
    let cellsRun = 0;
    const result = await runBenchDispatch({
      issueIds: [156, 162, 565],
      targetRepo: "szhygulin/vaultpilot-mcp",
      clonePath: "/tmp/fake-clone",
      replicates: 3,
      logsDir: dir,
      cwd: process.cwd(),
      // Budget = $2 with each cell at $1 → we get ~2 cells before halt.
      maxTotalCostUsd: 2,
      regOverride: FIXTURE_REGISTRY,
      fetchIssueLabels: async () => [],
      spawnCell: async (_spec, logPath) => {
        cellsRun += 1;
        await writeSyntheticLog(logPath, 1.0, "implement");
        return { rc: 0 };
      },
    });
    assert.ok(result.budgetExhausted, "expected budgetExhausted");
    // Should have run 2 or 3 cells before halt (budget check is before-spawn)
    assert.ok(cellsRun <= 3, `expected ≤ 3 cells before halt, got ${cellsRun}`);
    assert.ok(cellsRun >= 2, `expected ≥ 2 cells, got ${cellsRun}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("runBenchDispatch: emits onEvent for pick / start / done in order", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-dispatch-events-"));
  try {
    const events: string[] = [];
    await runBenchDispatch({
      issueIds: [156],
      targetRepo: "szhygulin/vaultpilot-mcp",
      clonePath: "/tmp/fake-clone",
      replicates: 2,
      logsDir: dir,
      cwd: process.cwd(),
      regOverride: FIXTURE_REGISTRY,
      fetchIssueLabels: async () => ["solana"],
      spawnCell: async (_spec, logPath) => {
        await writeSyntheticLog(logPath, 0.1, "implement");
        return { rc: 0 };
      },
      onEvent: (e) => events.push(e.kind),
    });
    // Expected order: pick (1), start (1), done (1), start (2), done (2)
    assert.deepEqual(events, ["pick", "start", "done", "start", "done"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("runBenchDispatch: replicates default to 3 when not specified", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-dispatch-default-"));
  try {
    let n = 0;
    await runBenchDispatch({
      issueIds: [156],
      targetRepo: "szhygulin/vaultpilot-mcp",
      clonePath: "/tmp/fake-clone",
      logsDir: dir,
      cwd: process.cwd(),
      regOverride: FIXTURE_REGISTRY,
      fetchIssueLabels: async () => [],
      spawnCell: async (_spec, logPath) => {
        n += 1;
        await writeSyntheticLog(logPath, 0.1, "implement");
        return { rc: 0 };
      },
    });
    assert.equal(n, 3);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
