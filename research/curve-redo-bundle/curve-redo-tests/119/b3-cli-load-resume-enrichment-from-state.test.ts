// loadResumeEnrichment reads <runId>.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 cli load resume enrichment from state", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /\$\{[^}]+\}\.json|`\$\{runId\}\.json`/);
});
