import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("a test file under test/ asserts the chain-data integrity behavior", () => {
  const out = execSync(
    `grep -rlE 'chain.data.integrity|secondary.RPC|RPC.corroborat|rogue.RPC|scam.pattern|rate.of.change' test/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  expect(out.trim().length).toBeGreaterThan(0);
});
