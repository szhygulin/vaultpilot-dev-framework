// PR #628's test additions check `cur.acknowledgedNonProtocolTarget` on
// the swap leg. Verify this exact pattern survives.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts asserts cur.acknowledgedNonProtocolTarget or tx.acknowledgedNonProtocolTarget", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/(?:cur|tx)\.acknowledgedNonProtocolTarget/);
});
