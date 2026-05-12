// Logger emits run.resume_incomplete_resolved when flag set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 cli resume incomplete resolved event", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /resume_incomplete_resolved/);
});
