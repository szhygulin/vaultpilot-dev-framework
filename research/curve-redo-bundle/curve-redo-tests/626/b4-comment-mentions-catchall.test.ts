import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("rationale comment references catch-all / assertTransactionSafe", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/catch-all|assertTransactionSafe|unknown destination|destination gate/i);
});
