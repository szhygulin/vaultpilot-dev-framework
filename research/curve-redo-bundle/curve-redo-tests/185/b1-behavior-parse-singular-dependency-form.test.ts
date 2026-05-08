import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref from singular inline 'Dependency: #178' form", () => {
  const body = "Quick note. Dependency: #178 must merge first.\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
