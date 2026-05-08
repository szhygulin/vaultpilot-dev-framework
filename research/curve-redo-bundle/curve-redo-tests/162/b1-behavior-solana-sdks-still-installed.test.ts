import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("package-lock retains the SDK families called out in the issue body", () => {
  const lock = readFileSync(join(ROOT, "package-lock.json"), "utf8");
  expect(lock).toMatch(/@mrgnlabs\/marginfi-client-v2/);
  expect(lock).toMatch(/@marinade\.finance\/marinade-ts-sdk/);
  // Kamino: at least one of the kamino-finance scoped pkgs.
  expect(lock).toMatch(/@kamino-finance\//);
  expect(lock).toMatch(/@raydium-io\/raydium-sdk-v2/);
  expect(lock).toMatch(/@solana\/spl-stake-pool/);
});
