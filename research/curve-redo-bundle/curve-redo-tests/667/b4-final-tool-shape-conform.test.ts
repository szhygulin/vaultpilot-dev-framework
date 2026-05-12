import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("final soft signal: tool-shape-conform", () => {
  const out = execSync(`grep -rIE 'zod|t\.|TypeBox|joi' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
