import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("at least one file under src/ matches readonly|readOnly", () => {
  const out = execSync(`grep -rIlE 'readonly|readOnly' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.split("\n").filter(Boolean).length).toBeGreaterThan(0);
});
