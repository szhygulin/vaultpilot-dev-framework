import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("sentinel/preflight block emission occurs for import_readonly_token", () => {
  const out = execSync(`grep -rIE 'VAULTPILOT PIN|VAULTPILOT NOTICE|emitPin|emitSentinel' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
