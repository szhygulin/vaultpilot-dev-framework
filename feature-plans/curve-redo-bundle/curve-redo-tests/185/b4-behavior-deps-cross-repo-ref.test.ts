import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: extracts `owner/repo#N` cross-repo references", () => {
  const body = `## Dependencies\n\n- szhygulin/vaultpilot-mcp#100 must land first\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(100), `expected 100 in ${JSON.stringify(refs)}`);
});
