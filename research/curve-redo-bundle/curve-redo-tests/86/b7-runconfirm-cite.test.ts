// runConfirm cites #86 / snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 runconfirm cite", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runConfirm.ts"), "utf8");
  assert.match(src, /#86|snapshot/);
});
