// ResumeContext has optional `errorSubtype`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 resume context errorsubtype optional", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /ResumeContext[\s\S]*?errorSubtype\s*\?\s*:/);
});
