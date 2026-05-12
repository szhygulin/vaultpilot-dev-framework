// ResumeContext optional fields are back-compat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 types resume context back compat", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /ResumeContext[\s\S]*?errorSubtype\s*\?\s*:[\s\S]*?finalText\s*\?\s*:[\s\S]*?partialBranchUrl\s*\?\s*:/);
});
