// The second action line in the breadcrumb mentions 'Live tail' so an
// operator can discover the watch loop without `--help` round-trips.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts contains a 'Live tail' label", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Live tail/i);
});
