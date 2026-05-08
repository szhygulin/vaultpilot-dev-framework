import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref from inline 'Dependencies: #178' form", () => {
  const body = "Some preamble.\n\nDependencies: #178 must land first.\n\nMore text.\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
