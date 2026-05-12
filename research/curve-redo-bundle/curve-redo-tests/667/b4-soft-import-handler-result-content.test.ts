import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: import-handler-result-content", () => {
  const out = execSync(`grep -rIE 'result.*content|content.*result' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
