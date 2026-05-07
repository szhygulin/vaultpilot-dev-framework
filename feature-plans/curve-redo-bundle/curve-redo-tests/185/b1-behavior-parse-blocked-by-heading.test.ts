import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref from ## Blocked by heading", () => {
  const body = "## Blocked by\n\n#42\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(42), `expected refs to include 42, got ${JSON.stringify([...refs])}`);
});
