// src/agent/prompt.ts imports ResumeContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 resume context imported by prompt", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /ResumeContext/);
});
