import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: matches mixed-case ## Depends On heading", () => {
  const body = "## Depends On\n\n#55\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(55), `expected refs to include 55, got ${JSON.stringify([...refs])}`);
});
