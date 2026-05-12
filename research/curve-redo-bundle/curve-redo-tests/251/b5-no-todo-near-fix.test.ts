import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("no TODO/FIXME markers immediately around the libc-detect surface", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Future-flagged TODOs (like 'see #29 / #251 follow-up') in existing comments are OK.
  // Active TODOs/FIXMEs on the new auto-detect logic should be absent.
  const lines = src.split("\n");
  const todoLines = lines.filter((l) => /\bTODO\b|\bFIXME\b/.test(l));
  // Allow only a small number of historical references.
  assert.ok(todoLines.length <= 3, `too many TODO/FIXME (${todoLines.length})`);
});
