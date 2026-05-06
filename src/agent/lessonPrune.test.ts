import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyLessonPrune,
  computePruneProposalHash,
  formatLessonPruneProposal,
  hashFile,
  proposeLessonPrune,
  type PruneProposal,
} from "./lessonPrune.js";
import { dropSentinelsByStableId } from "../util/sentinels.js";
import { DEFAULT_PRUNE_MIN_SIBLINGS_AFTER, deriveStableSectionId } from "../state/lessonUtility.js";
import { formatSentinelHeader } from "../util/sentinels.js";

function makeAgentClaudeMd(
  blocks: ReadonlyArray<{
    runId: string;
    issueId: number;
    heading: string;
    body: string;
    ts: string;
  }>,
): string {
  const out: string[] = ["# Project rules", ""];
  for (const b of blocks) {
    out.push(
      formatSentinelHeader({
        runId: b.runId,
        issueId: b.issueId,
        outcome: "implement",
        ts: b.ts,
      }),
    );
    out.push(`## ${b.heading}`);
    out.push("");
    out.push(b.body);
    out.push("");
  }
  return out.join("\n");
}

async function withTempClaudeMd<T>(
  initialContent: string,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-prune-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, initialContent);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------
// dropSentinelsByStableId — the underlying surgery
// -----------------------------------------------------------------------

test("dropSentinelsByStableId: drops only matched stable IDs", () => {
  const content = makeAgentClaudeMd([
    { runId: "run-A", issueId: 1, heading: "First", body: "body 1", ts: "2026-04-01T00:00:00Z" },
    { runId: "run-B", issueId: 2, heading: "Second", body: "body 2", ts: "2026-04-02T00:00:00Z" },
    { runId: "run-C", issueId: 3, heading: "Third", body: "body 3", ts: "2026-04-03T00:00:00Z" },
  ]);
  const dropId = deriveStableSectionId("run-B", [2]);
  const result = dropSentinelsByStableId(
    content,
    new Set([dropId]),
    (h) => deriveStableSectionId(h.runId, h.issueIds ?? [h.issueId]),
  );
  assert.equal(result.droppedHeaders.length, 1);
  assert.equal(result.droppedHeaders[0].issueId, 2);
  assert.match(result.content, /## First/);
  assert.match(result.content, /## Third/);
  assert.doesNotMatch(result.content, /## Second/);
});

test("dropSentinelsByStableId: empty drop set is a no-op", () => {
  const content = makeAgentClaudeMd([
    { runId: "run-A", issueId: 1, heading: "First", body: "body 1", ts: "2026-04-01T00:00:00Z" },
  ]);
  const result = dropSentinelsByStableId(content, new Set(), () => "");
  assert.equal(result.droppedHeaders.length, 0);
  assert.equal(result.content, content);
});

// -----------------------------------------------------------------------
// applyLessonPrune — full two-step path
// -----------------------------------------------------------------------

function makeProposal(stableIds: string[]): PruneProposal {
  return {
    agentId: "agent-test",
    generatedAt: "2026-05-06T10:00:00Z",
    pruned: stableIds.map((id) => ({
      stableId: id,
      reason: "zero-reinforcement" as const,
      introducedRunId: "run-X",
      introducedAt: "2026-04-01T00:00:00Z",
      siblingsIntroducedAfter: 11,
      reinforcementRuns: 0,
      pushbackRuns: 0,
    })),
    bytesBefore: 1000,
    minSiblingsAfter: 10,
  };
}

test("applyLessonPrune: applies a valid token, drops the matching section", async () => {
  const content = makeAgentClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Keeper", body: "body 1", ts: "2026-04-01T00:00:00Z" },
    { runId: "run-B", issueId: 2, heading: "Stale rule", body: "body 2", ts: "2026-04-02T00:00:00Z" },
  ]);
  await withTempClaudeMd(content, async (filePath) => {
    const dropId = deriveStableSectionId("run-B", [2]);
    const proposal = makeProposal([dropId]);
    const hash = computePruneProposalHash(proposal, content);
    const result = await applyLessonPrune({
      agentId: "agent-test",
      proposal,
      expectedProposalHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "applied");
    if (result.kind === "applied") {
      assert.equal(result.sectionsDropped, 1);
      assert.ok(result.bytesAfter < result.bytesBefore);
    }
    const after = await fs.readFile(filePath, "utf-8");
    assert.match(after, /## Keeper/);
    assert.doesNotMatch(after, /## Stale rule/);
  });
});

test("applyLessonPrune: rejects token with stale proposalHash (file drifted)", async () => {
  const content = makeAgentClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Original", body: "body 1", ts: "2026-04-01T00:00:00Z" },
  ]);
  await withTempClaudeMd(content, async (filePath) => {
    const dropId = deriveStableSectionId("run-A", [1]);
    const proposal = makeProposal([dropId]);
    const hashAtPlan = computePruneProposalHash(proposal, content);

    // Simulate concurrent edit: file content changes between plan and confirm.
    await fs.writeFile(filePath, content + "\n## Manual edit\n");

    const result = await applyLessonPrune({
      agentId: "agent-test",
      proposal,
      expectedProposalHash: hashAtPlan,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "proposal-hash");
    }
  });
});

test("applyLessonPrune: rejects empty proposal as no-sections", async () => {
  await withTempClaudeMd("# empty\n", async (filePath) => {
    const proposal = makeProposal([]);
    const hash = computePruneProposalHash(proposal, "# empty\n");
    const result = await applyLessonPrune({
      agentId: "agent-test",
      proposal,
      expectedProposalHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "no-sections");
    }
  });
});

test("applyLessonPrune: rejects when proposal references a stable ID not in the file", async () => {
  const content = makeAgentClaudeMd([
    { runId: "run-A", issueId: 1, heading: "Only one", body: "body 1", ts: "2026-04-01T00:00:00Z" },
  ]);
  await withTempClaudeMd(content, async (filePath) => {
    // Reference a non-existent section.
    const phantomId = deriveStableSectionId("run-PHANTOM", [999]);
    const proposal = makeProposal([phantomId]);
    const hash = computePruneProposalHash(proposal, content);
    const result = await applyLessonPrune({
      agentId: "agent-test",
      proposal,
      expectedProposalHash: hash,
      claudeMdPathOverride: filePath,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind === "drift-rejected") {
      assert.equal(result.reason, "no-match");
    }
  });
});

test("computePruneProposalHash: stable across object key ordering", () => {
  const a = makeProposal(["aaa", "bbb"]);
  const b = makeProposal(["bbb", "aaa"]);
  // Sort happens inside the helper, so the hashes must agree.
  assert.equal(
    computePruneProposalHash(a, "content"),
    computePruneProposalHash(b, "content"),
  );
});

test("computePruneProposalHash: changes when file content changes", () => {
  const proposal = makeProposal(["aaa"]);
  const h1 = computePruneProposalHash(proposal, "content-1");
  const h2 = computePruneProposalHash(proposal, "content-2");
  assert.notEqual(h1, h2);
});

test("hashFile: returns sha256 hex", () => {
  const h = hashFile("hello");
  assert.match(h, /^[a-f0-9]{64}$/);
});

test("formatLessonPruneProposal: renders empty case + populated case readably", () => {
  const empty = formatLessonPruneProposal(makeProposal([]));
  assert.match(empty, /Nothing to prune/);
  const populated = formatLessonPruneProposal(makeProposal(["abcdef0123456789"]));
  assert.match(populated, /1 section\(s\) eligible for removal/);
  assert.match(populated, /\[zero-reinforcement\]/);
  assert.match(populated, /Pass --apply/);
});

// Regression for the smoke-test bug: when a caller passed minSiblingsAfter
// to proposeLessonPrune AND the resulting stale list was empty, the
// fallback expression took the Math.min(...empty) branch and surfaced
// `Infinity` as the threshold in the rendered output. The proposal's
// minSiblingsAfter must always reflect the configured policy, not be
// derived from the (possibly empty) stale list.
test("proposeLessonPrune: minSiblingsAfter mirrors the configured threshold even when nothing is stale", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-empty-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, "# empty\n");
  try {
    const proposal = await proposeLessonPrune({
      agentId: "agent-nonexistent-test",
      minSiblingsAfter: 7,
      claudeMdPathOverride: filePath,
    });
    assert.equal(proposal.pruned.length, 0);
    assert.equal(proposal.minSiblingsAfter, 7);
    assert.notEqual(proposal.minSiblingsAfter, Infinity);
    const rendered = formatLessonPruneProposal(proposal);
    assert.doesNotMatch(rendered, /Infinity/);
    assert.match(rendered, /at least 7/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("proposeLessonPrune: minSiblingsAfter falls back to DEFAULT when not provided", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-default-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  await fs.writeFile(filePath, "# empty\n");
  try {
    const proposal = await proposeLessonPrune({
      agentId: "agent-nonexistent-default",
      claudeMdPathOverride: filePath,
    });
    assert.equal(proposal.minSiblingsAfter, DEFAULT_PRUNE_MIN_SIBLINGS_AFTER);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
