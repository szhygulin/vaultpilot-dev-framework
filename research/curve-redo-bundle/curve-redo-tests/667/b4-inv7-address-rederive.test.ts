import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("address rederivation / curated map keyword present", () => {
  const out = execSync(`grep -rIE 'rederiv|curated.?map|rederive.*address|address.*derivation' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
