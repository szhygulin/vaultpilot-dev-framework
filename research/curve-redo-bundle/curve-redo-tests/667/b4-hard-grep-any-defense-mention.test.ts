import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("hard grep: any-defense-mention appears in src/", () => {
  const out = execSync(`grep -rIE 'defense|invariant|guard|protect' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
