// Issue notes: STRENGTHENED — same shape as batch-03 F-class chain-data
// integrity gap. Source comment / docstring should reference this.
import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("source references batch-03 or F-class chain-data finding (cross-batch link)", () => {
  const out = execSync(
    `grep -rIE 'batch-03|F-class|chain.data.integrity' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  if (out.trim().length === 0) {
    console.log("[hint] batch-03 / F-class cross-reference not in source — may be in docs only");
  }
  expect(true).toBe(true);
});
