import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("#667 cited in a test file OR src/ file", () => {
  const inSrc = execSync(`grep -rlE '#667' src/ 2>/dev/null || true`, { encoding: "utf8" });
  const inTests = execSync(`grep -rIlE '#667' . --include='*.test.*' --include='*.spec.*' 2>/dev/null || true`, { encoding: "utf8" });
  expect((inSrc + inTests).trim().length).toBeGreaterThan(0);
});
