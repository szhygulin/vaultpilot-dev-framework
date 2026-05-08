import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref from ## Prerequisites heading", () => {
  const body = "## Prerequisites\n\n#100 must merge first\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(100), `expected refs to include 100, got ${JSON.stringify([...refs])}`);
});
