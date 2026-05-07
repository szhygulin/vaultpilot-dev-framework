// Cost budget: 'prints once per run'. The header literal should appear
// exactly once in src/cli.ts (the confirm-exit branch).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts contains 'Run launched' header exactly once", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const matches = src.match(/Run launched/g) ?? [];
  assert.equal(matches.length, 1, `expected exactly one 'Run launched' header, found ${matches.length}`);
});
