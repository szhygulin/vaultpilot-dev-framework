import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEnvelope } from "./aggregate.js";

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
