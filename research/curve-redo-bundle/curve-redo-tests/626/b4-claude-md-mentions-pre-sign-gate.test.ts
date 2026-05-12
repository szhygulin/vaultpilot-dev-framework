import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md references the pre-sign gate concept (block surface sweeps lesson)", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/pre-sign|assertTransactionSafe|destination gate|surface sweep/i);
});
