import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md rule enumerates assertTransactionSafe blocks (2/3/4/5)", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/block\s*2|block\s*3|block\s*4|block\s*5/i);
});
