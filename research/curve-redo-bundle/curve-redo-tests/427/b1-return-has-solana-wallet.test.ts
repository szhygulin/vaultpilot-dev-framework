// Return type exposes solanaWallet.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 return has solana wallet", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/getHealthAlerts[\s\S]*?solanaWallet/);
});
