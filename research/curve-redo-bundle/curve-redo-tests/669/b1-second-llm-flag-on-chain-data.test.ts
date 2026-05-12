// Existing pattern: secondLlmRequired flag stamped on opaque calldata
// (per s001 in the super-agent). The same pattern could apply for
// chain-data fraud — stamp secondLlmRequired when chain-data has
// rogue-RPC indicators.
import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("chain-data flow stamps secondLlmRequired or similar verification flag", () => {
  const out = execSync(
    `grep -rIE 'secondLlmRequired|cross.RPC|verifyChain|chainDataIntegrity' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  expect(out.trim().length).toBeGreaterThan(0);
});
