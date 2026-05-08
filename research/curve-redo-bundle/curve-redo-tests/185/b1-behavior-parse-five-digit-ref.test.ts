import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts five-digit ref #99999", () => {
  const body = "## Dependencies\n\n#99999 is the prereq\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(99999), `expected refs to include 99999, got ${JSON.stringify([...refs])}`);
});
