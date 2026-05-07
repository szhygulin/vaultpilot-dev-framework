import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts #178 from canonical italic inline form quoted in issue", () => {
  const body = `*Dependencies: #178 (Phase 1) MUST land first — verdicts off lesson-utility need that file populated.*
`;
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
