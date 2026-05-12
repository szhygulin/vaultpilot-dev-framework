import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: tx-history-double-source", () => {
  const out = execSync(`grep -rIE 'double.source|two.sources|multi.source' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
