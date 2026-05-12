// CLI help mentions enforcement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 cli max cost help enforcement", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /--max-cost-usd[\s\S]*?(stops dispatching|aborted-budget|abort|enforcement)/);
});
