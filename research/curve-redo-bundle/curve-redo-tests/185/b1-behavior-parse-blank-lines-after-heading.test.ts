import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref despite multiple blank lines after heading", () => {
  const body = `## Dependencies



- #178
`;
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
