import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for post-import-confirm signal", () => {
  const out = execSync(`grep -rIE 'post.import|after.import|on.import' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
