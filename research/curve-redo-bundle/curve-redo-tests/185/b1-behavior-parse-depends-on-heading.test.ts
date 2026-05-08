import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref from ## Depends on heading", () => {
  const body = "## Depends on\n\n#178 must land first\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
