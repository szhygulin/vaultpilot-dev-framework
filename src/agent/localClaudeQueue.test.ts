import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO,
  appendToLocalClaudeQueue,
  evaluateLocalClaudeUtilityGate,
  resolveLocalClaudeUtilityRatio,
} from "./localClaudeQueue.js";

// Use unique tmp paths per test so this file's tests don't race with
// `promotion.test.ts` (which writes to the real LOCAL_CLAUDE_QUEUE_FILE)
// when node:test runs files in parallel.
async function withTmpQueue<T>(
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "local-claude-queue-test-"));
  const filePath = path.join(dir, "pending.md");
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------
// resolveLocalClaudeUtilityRatio
// ---------------------------------------------------------------------

test("resolveLocalClaudeUtilityRatio: defaults + valid + invalid env", () => {
  assert.equal(resolveLocalClaudeUtilityRatio({}), DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO);
  assert.equal(
    resolveLocalClaudeUtilityRatio({ VP_DEV_LOCAL_CLAUDE_UTILITY_RATIO: "3.0" }),
    3.0,
  );
  assert.equal(
    resolveLocalClaudeUtilityRatio({ VP_DEV_LOCAL_CLAUDE_UTILITY_RATIO: "0" }),
    0,
  );
  assert.equal(
    resolveLocalClaudeUtilityRatio({ VP_DEV_LOCAL_CLAUDE_UTILITY_RATIO: "abc" }),
    DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO,
  );
  assert.equal(
    resolveLocalClaudeUtilityRatio({ VP_DEV_LOCAL_CLAUDE_UTILITY_RATIO: "-1" }),
    DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO,
  );
});

test("DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO is 2.0 (stricter than per-agent)", () => {
  // Documented in the plan and prompt: bytes added to local CLAUDE.md are
  // amplified across every dispatch; the bar is higher than the per-agent
  // gate's 1.0 default.
  assert.equal(DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO, 2.0);
});

// ---------------------------------------------------------------------
// evaluateLocalClaudeUtilityGate
// ---------------------------------------------------------------------

test("evaluateLocalClaudeUtilityGate: undefined utility → no-utility", () => {
  const r = evaluateLocalClaudeUtilityGate({
    utility: undefined,
    currentLocalClaudeMdBytes: 10_000,
    candidateBytes: 500,
  });
  assert.equal(r.decision, "no-utility");
});

test("evaluateLocalClaudeUtilityGate: empty local CLAUDE.md (cost=0) lets through any utility", () => {
  const r = evaluateLocalClaudeUtilityGate({
    utility: 0.0,
    currentLocalClaudeMdBytes: 0,
    candidateBytes: 500,
  });
  assert.equal(r.decision, "let-through");
});

test("evaluateLocalClaudeUtilityGate: high utility passes mid-size cost at default ratio 2.0", () => {
  // At ~25 KB the costScore is ~0.36 (per the curve). With ratio=2.0,
  // threshold ≈ 0.72. utility=0.85 passes.
  const r = evaluateLocalClaudeUtilityGate({
    utility: 0.85,
    currentLocalClaudeMdBytes: 25_000,
    candidateBytes: 500,
  });
  assert.equal(r.decision, "let-through");
});

test("evaluateLocalClaudeUtilityGate: 0.5 utility skipped at mid-size with default ratio 2.0", () => {
  // Same costScore ≈ 0.36, threshold ≈ 0.72; utility=0.5 < 0.72 → skip.
  const r = evaluateLocalClaudeUtilityGate({
    utility: 0.5,
    currentLocalClaudeMdBytes: 25_000,
    candidateBytes: 500,
  });
  assert.equal(r.decision, "skip");
});

test("evaluateLocalClaudeUtilityGate: ratio override drops the bar", () => {
  // Same utility 0.5 + costScore 0.36; with ratio=1.0 (per-agent ratio),
  // threshold = 0.36 → utility 0.5 passes.
  const r = evaluateLocalClaudeUtilityGate({
    utility: 0.5,
    currentLocalClaudeMdBytes: 25_000,
    candidateBytes: 500,
    ratio: 1.0,
  });
  assert.equal(r.decision, "let-through");
});

test("evaluateLocalClaudeUtilityGate: result fields are populated and finite", () => {
  const r = evaluateLocalClaudeUtilityGate({
    utility: 0.7,
    currentLocalClaudeMdBytes: 15_000,
    candidateBytes: 800,
  });
  assert.ok(Number.isFinite(r.costScore));
  assert.ok(Number.isFinite(r.threshold));
  assert.equal(typeof r.ratio, "number");
});

// ---------------------------------------------------------------------
// appendToLocalClaudeQueue
// ---------------------------------------------------------------------

test("appendToLocalClaudeQueue: writes provenance header + body to a fresh queue", async () => {
  await withTmpQueue(async (filePath) => {
    const out = await appendToLocalClaudeQueue({
      sourceAgentId: "agent-test",
      ts: "2026-05-06T15:00:00.000Z",
      utility: 0.85,
      gate: {
        decision: "let-through",
        costScore: 0.4,
        threshold: 0.8,
        ratio: 2.0,
      },
      body: "## Project-wide rule\n\nBody content here.",
      filePathOverride: filePath,
    });
    assert.equal(out.filePath, filePath);
    assert.ok(out.bytesAppended > 0);
    const content = await fs.readFile(filePath, "utf-8");
    assert.match(content, /<!-- queued source=agent-test/);
    assert.match(content, /utility=0\.85/);
    assert.match(content, /gate=let-through/);
    assert.match(content, /## Project-wide rule/);
    assert.match(content, /Body content here\./);
  });
});

test("appendToLocalClaudeQueue: utility absent omits the field from header", async () => {
  await withTmpQueue(async (filePath) => {
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-x",
      ts: "2026-05-06T15:00:00.000Z",
      body: "no-utility body",
      filePathOverride: filePath,
    });
    const content = await fs.readFile(filePath, "utf-8");
    assert.doesNotMatch(content, /utility=/);
    assert.match(content, /<!-- queued source=agent-x/);
  });
});

test("appendToLocalClaudeQueue: appends to existing file (multiple entries)", async () => {
  await withTmpQueue(async (filePath) => {
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-a",
      ts: "2026-05-06T15:00:00.000Z",
      body: "first",
      filePathOverride: filePath,
    });
    await appendToLocalClaudeQueue({
      sourceAgentId: "agent-b",
      ts: "2026-05-06T15:01:00.000Z",
      body: "second",
      filePathOverride: filePath,
    });
    const content = await fs.readFile(filePath, "utf-8");
    assert.match(content, /source=agent-a/);
    assert.match(content, /source=agent-b/);
    assert.match(content, /first/);
    assert.match(content, /second/);
  });
});

test("appendToLocalClaudeQueue: concurrent writes serialize via the lock", async () => {
  await withTmpQueue(async (filePath) => {
    await Promise.all([
      appendToLocalClaudeQueue({
        sourceAgentId: "agent-1",
        ts: "T1",
        body: "body-1",
        filePathOverride: filePath,
      }),
      appendToLocalClaudeQueue({
        sourceAgentId: "agent-2",
        ts: "T2",
        body: "body-2",
        filePathOverride: filePath,
      }),
      appendToLocalClaudeQueue({
        sourceAgentId: "agent-3",
        ts: "T3",
        body: "body-3",
        filePathOverride: filePath,
      }),
    ]);
    const content = await fs.readFile(filePath, "utf-8");
    // All three sources should land. Order depends on lock acquisition;
    // we don't assert order, just that nothing was lost to a race.
    assert.match(content, /source=agent-1/);
    assert.match(content, /source=agent-2/);
    assert.match(content, /source=agent-3/);
    assert.match(content, /body-1/);
    assert.match(content, /body-2/);
    assert.match(content, /body-3/);
  });
});
