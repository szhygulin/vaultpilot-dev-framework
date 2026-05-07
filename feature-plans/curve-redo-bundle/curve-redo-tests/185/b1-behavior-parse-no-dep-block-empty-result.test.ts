import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: body with no dependency declaration returns empty", () => {
  const body = `# Some title

Random body text without any dependency declaration. Just describing a problem.
`;
  const refs = parseDependencies(body);
  assert.equal([...refs].length, 0);
});
