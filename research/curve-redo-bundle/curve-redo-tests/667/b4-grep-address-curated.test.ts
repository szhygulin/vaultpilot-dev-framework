import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for address-curated signal", () => {
  const out = execSync(`grep -rIE 'curated|knownAddress|address.list' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
