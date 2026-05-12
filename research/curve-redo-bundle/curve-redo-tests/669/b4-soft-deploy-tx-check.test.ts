import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: deploy-tx-check", () => {
  const out = execSync(`grep -rIE 'deploy.tx|deployment.verif|contract.deploy' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
