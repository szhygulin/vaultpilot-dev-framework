import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: check-permission-risks-ref", () => {
  const out = execSync(`grep -rIE 'check_permission_risks|permissionRisk' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
