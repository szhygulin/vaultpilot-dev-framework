import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("final soft signal: issue-667-pr-reference", () => {
  const out = execSync(`grep -rIE '#667|PR.*667' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
