// Cites memory-poisoning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 ric memory poisoning", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /memory poisoning|memory-poisoning/i);
});
