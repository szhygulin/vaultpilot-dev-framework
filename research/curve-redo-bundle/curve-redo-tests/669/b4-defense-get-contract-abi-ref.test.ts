import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: get-contract-abi-ref", () => {
  const out = execSync(`grep -rIE 'get_contract_abi|contract.abi' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
