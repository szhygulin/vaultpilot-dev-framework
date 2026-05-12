import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md rule names assertTransactionSafe block-4 catch-all", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/block 4|catch-all|catch all|unknown destination|assertTransactionSafe/i);
});
