import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("hard grep: claude-md-discipline appears in src/", () => {
  const out = execSync(`grep -rIE 'CLAUDE.md|claude.md|skill-pin' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
