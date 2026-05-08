import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: matches mixed-case ## Blocked By heading", () => {
  const body = "## Blocked By\n\n#7 needs to ship\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(7), `expected refs to include 7, got ${JSON.stringify([...refs])}`);
});
