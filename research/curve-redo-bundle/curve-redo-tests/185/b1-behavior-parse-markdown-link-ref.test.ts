import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts ref from markdown-link form", () => {
  const body = "## Dependencies\n\n[#178](https://github.com/szhygulin/vaultpilot-dev-framework/issues/178) must land first\n";
  const refs = parseDependencies(body);
  assert.ok([...refs].includes(178), `expected refs to include 178, got ${JSON.stringify([...refs])}`);
});
