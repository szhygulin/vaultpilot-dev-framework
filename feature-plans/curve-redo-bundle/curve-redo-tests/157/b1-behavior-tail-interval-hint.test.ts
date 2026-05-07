// The proposal annotates 'Live tail: vp-dev status --watch' with a hash
// comment describing the re-render-on-interval behaviour, so operators
// understand --watch without hitting --help.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Live tail' breadcrumb mentions interval/re-renders behavior", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Live tail[\s\S]{0,200}(?:re-renders|interval)/);
});
