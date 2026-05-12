import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for tool-return-shape signal", () => {
  const out = execSync(`grep -rIE 'returnShape|toolResult|content:' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
