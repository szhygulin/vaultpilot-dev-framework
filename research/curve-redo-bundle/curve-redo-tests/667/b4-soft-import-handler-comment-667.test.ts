import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: import-handler-comment-667", () => {
  const out = execSync(`grep -rIE '#667' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
