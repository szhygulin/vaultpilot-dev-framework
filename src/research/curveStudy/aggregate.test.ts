import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { aggregateLogsDir, extractEnvelope } from "./aggregate.js";

test("extractEnvelope: finds the last top-level JSON object after npm chatter", () => {
  const text =
    [
      "> vaultpilot-development-agents@0.1.0 vp-dev",
      "> node dist/bin/vp-dev.js spawn ...",
      "[12:00:01] some chatter",
      "{",
      '  "envelope": {',
      '    "decision": "implement",',
      '    "reason": "did the work"',
      "  },",
      '  "costUsd": 5.42,',
      '  "durationMs": 312000',
      "}",
    ].join("\n");
  const env = extractEnvelope(text) as
    | { envelope: { decision: string }; costUsd: number }
    | null;
  assert.ok(env, "envelope must parse");
  assert.equal(env!.envelope.decision, "implement");
  assert.equal(env!.costUsd, 5.42);
});

test("extractEnvelope: spawn-stub log without envelope returns null", () => {
  const text =
    "> vaultpilot-development-agents@0.1.0 vp-dev\n> node dist/bin/vp-dev.js spawn ...\n";
  assert.equal(extractEnvelope(text), null);
});

test("extractEnvelope: handles trailing whitespace after the JSON", () => {
  const text = '\n{\n  "envelope": {"decision": "pushback"}\n}\n\n\n';
  const env = extractEnvelope(text) as { envelope: { decision: string } } | null;
  assert.ok(env);
  assert.equal(env!.envelope.decision, "pushback");
});

test("aggregateLogsDir: matches plan-trims agent IDs (hex + hyphens, not just digits)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agg-trim-test-"));
  try {
    const envelope = {
      envelope: { decision: "pushback", reason: "tracking issue" },
      costUsd: 0.244,
      durationMs: 47666,
      isError: false,
    };
    const trimAgentId = "agent-916a-trim-6000-s8026";
    await fs.writeFile(
      path.join(dir, `curveStudy-${trimAgentId}-156.log`),
      `> spawn chatter\n\n${JSON.stringify(envelope, null, 2)}\n`,
    );
    const cells = await aggregateLogsDir({
      logsDir: dir,
      prefix: "curveStudy-",
      agentSizes: new Map([[trimAgentId, 5935]]),
    });
    assert.equal(cells.length, 1, "trim-agent log must aggregate to 1 cell");
    assert.equal(cells[0].agentId, trimAgentId);
    assert.equal(cells[0].issueId, 156);
    assert.equal(cells[0].agentSizeBytes, 5935);
    assert.equal(cells[0].decision, "pushback");
    assert.equal(cells[0].costUsd, 0.244);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
