// The proposal annotates the canonical command line with a hash comment
// '# active run, no args needed' so the operator knows why no args are
// required. Test that the 'active run' hint appears near 'Check progress'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Check progress' breadcrumb annotates the canonical command with an 'active run' hint", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Check progress[\s\S]{0,200}active run/);
});
