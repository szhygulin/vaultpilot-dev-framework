import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts single-digit ref #1", () => {
  const body = "## Dependencies\n\n#1 must land first\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(1), `expected refs to include 1, got ${JSON.stringify([...refs])}`);
});
