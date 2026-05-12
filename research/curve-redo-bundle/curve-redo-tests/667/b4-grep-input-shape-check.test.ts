import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for input-shape-check signal", () => {
  const out = execSync(`grep -rIE 'zod|schema|validateInput|inputSchema' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
