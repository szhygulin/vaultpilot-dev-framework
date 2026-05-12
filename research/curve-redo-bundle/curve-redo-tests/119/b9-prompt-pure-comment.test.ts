// renderResumeBlock comment claims 'no I/O'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 prompt pure comment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /no I\/O/);
});
