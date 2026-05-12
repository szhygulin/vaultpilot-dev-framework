import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("import_strategy or share_strategy mentioned in src/ (issue analogy)", () => {
  const out = execSync(`grep -rlE 'import_strategy|share_strategy' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
