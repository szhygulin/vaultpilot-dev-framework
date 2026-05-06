// Integration test for #179 Phase 2 follow-up: acceptCandidate dispatches
// `@local-claude` candidates to the queue file and rewrites the source
// marker, while regular domains continue to land in the shared-pool.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { acceptCandidate, collectPendingCandidates } from "./promotion.js";
import { agentClaudeMdPath, agentDir } from "./specialization.js";
import { LOCAL_CLAUDE_QUEUE_FILE } from "./localClaudeQueue.js";
import type { AgentRecord } from "../types.js";

let testCounter = 0;
function makeAgentId(): string {
  return `agent-promotion-test-${process.pid}-${++testCounter}`;
}

function makeAgentRecord(agentId: string): AgentRecord {
  return {
    agentId,
    createdAt: "2026-05-06T00:00:00.000Z",
    tags: [],
    issuesHandled: 0,
    implementCount: 0,
    pushbackCount: 0,
    errorCount: 0,
    lastActiveAt: "2026-05-06T00:00:00.000Z",
  };
}

async function withTestAgent<T>(
  initialClaudeMd: string,
  fn: (agentId: string, agent: AgentRecord) => Promise<T>,
): Promise<T> {
  const agentId = makeAgentId();
  const dir = agentDir(agentId);
  await fs.mkdir(dir, { recursive: true });
  const claudeMdPath = agentClaudeMdPath(agentId);
  await fs.writeFile(claudeMdPath, initialClaudeMd);
  try {
    return await fn(agentId, makeAgentRecord(agentId));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(`${claudeMdPath}.lock`, { force: true });
  }
}

async function withCleanQueueFile<T>(fn: () => Promise<T>): Promise<T> {
  let backup: string | null = null;
  try {
    backup = await fs.readFile(LOCAL_CLAUDE_QUEUE_FILE, "utf-8");
  } catch {
    backup = null;
  }
  try {
    await fs.rm(LOCAL_CLAUDE_QUEUE_FILE, { force: true });
    await fs.rm(`${LOCAL_CLAUDE_QUEUE_FILE}.lock`, { force: true });
    return await fn();
  } finally {
    if (backup !== null) {
      await fs.writeFile(LOCAL_CLAUDE_QUEUE_FILE, backup);
    } else {
      await fs.rm(LOCAL_CLAUDE_QUEUE_FILE, { force: true });
    }
    await fs.rm(`${LOCAL_CLAUDE_QUEUE_FILE}.lock`, { force: true });
  }
}

test("acceptCandidate: @local-claude routes to queue file (not pool)", async () => {
  const md = [
    "# Test agent",
    "",
    "<!-- promote-candidate:@local-claude utility=0.7 -->",
    "Project-wide rule about pre-dispatch checks.",
    "<!-- /promote-candidate -->",
  ].join("\n");
  await withCleanQueueFile(async () => {
    await withTestAgent(md, async (agentId, agent) => {
      const pending = await collectPendingCandidates([agent]);
      assert.equal(pending.length, 1);
      assert.equal(pending[0].candidate.domain, "@local-claude");
      assert.equal(pending[0].candidate.utility, 0.7);

      const result = await acceptCandidate({
        pending: pending[0],
        tier: "target",
      });
      assert.equal(result.rewroteSource, true);
      assert.ok(result.localQueueOutcome);
      assert.equal(result.appendOutcome, undefined);

      // Queue file gained the entry.
      const queueContent = await fs.readFile(LOCAL_CLAUDE_QUEUE_FILE, "utf-8");
      assert.match(queueContent, new RegExp(`source=${agentId}`));
      assert.match(queueContent, /utility=0\.7/);
      assert.match(queueContent, /Project-wide rule about pre-dispatch checks\./);

      // Source marker got rewritten so the candidate doesn't resurface.
      const after = await fs.readFile(agentClaudeMdPath(agentId), "utf-8");
      assert.match(after, /<!-- promoted:@local-claude:/);
      assert.doesNotMatch(after, /<!-- promote-candidate:@local-claude/);
    });
  });
});

test("acceptCandidate: @local-claude with localGate records gate fields in queue header", async () => {
  const md = [
    "<!-- promote-candidate:@local-claude utility=0.85 -->",
    "body",
    "<!-- /promote-candidate -->",
  ].join("\n");
  await withCleanQueueFile(async () => {
    await withTestAgent(md, async (_agentId, agent) => {
      const pending = await collectPendingCandidates([agent]);
      await acceptCandidate({
        pending: pending[0],
        tier: "target",
        localGate: {
          decision: "let-through",
          costScore: 0.45,
          threshold: 0.9,
          ratio: 2.0,
        },
      });
      const queueContent = await fs.readFile(LOCAL_CLAUDE_QUEUE_FILE, "utf-8");
      assert.match(queueContent, /gate=let-through/);
      assert.match(queueContent, /costScore=0\.4500/);
      assert.match(queueContent, /threshold=0\.9000/);
      assert.match(queueContent, /ratio=2/);
    });
  });
});

test("acceptCandidate: regular domain still goes to shared-pool path (back-compat)", async () => {
  // The pool-write isn't tested here (it would touch agents/.shared/lessons/);
  // we just confirm the dispatch shape: appendOutcome is set, localQueueOutcome
  // is undefined, regardless of pool-write success.
  const md = [
    "<!-- promote-candidate:solana -->",
    "Solana RPC fact.",
    "<!-- /promote-candidate -->",
  ].join("\n");
  await withCleanQueueFile(async () => {
    await withTestAgent(md, async (_agentId, agent) => {
      const pending = await collectPendingCandidates([agent]);
      assert.equal(pending[0].candidate.domain, "solana");
      const result = await acceptCandidate({
        pending: pending[0],
        tier: "target",
      });
      // Pool-write may or may not succeed depending on filesystem state
      // (tier="target" writes under agents/.shared/lessons/), but the
      // shape contract is: localQueueOutcome is NEVER set for non-@-domain.
      assert.equal(result.localQueueOutcome, undefined);
      assert.ok(result.appendOutcome);

      // Queue file should NOT have a new entry from this run.
      let queueContent = "";
      try {
        queueContent = await fs.readFile(LOCAL_CLAUDE_QUEUE_FILE, "utf-8");
      } catch {
        queueContent = "";
      }
      // No agent-promotion-test source ID should appear.
      assert.doesNotMatch(queueContent, /agent-promotion-test/);

      // Cleanup the pool file the accept created (to keep tests clean).
      const poolPath = path.resolve(
        process.cwd(),
        "agents/.shared/lessons/solana.md",
      );
      await fs.rm(poolPath, { force: true }).catch(() => {});
      await fs.rm(`${poolPath}.lock`, { force: true }).catch(() => {});
    });
  });
});
