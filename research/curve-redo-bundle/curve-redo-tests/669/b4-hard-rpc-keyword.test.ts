import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 hard grep: rpc-keyword present in src/", () => {
  const out = execSync(`grep -rIE 'rpc|chain|onchain' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
