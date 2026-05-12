import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 hard grep: src-dir present in src/", () => {
  const out = execSync(`grep -rIE 'src/' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
