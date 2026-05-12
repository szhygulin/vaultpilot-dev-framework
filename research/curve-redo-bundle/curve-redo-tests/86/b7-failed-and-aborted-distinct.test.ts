// Both 'failed' and 'aborted-budget' distinct literals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 failed and aborted distinct", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /["']failed["'][\s\S]*?["']aborted-budget["']|["']aborted-budget["'][\s\S]*?["']failed["']/);
});
