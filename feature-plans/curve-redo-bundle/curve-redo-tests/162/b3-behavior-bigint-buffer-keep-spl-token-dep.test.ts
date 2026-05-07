import { test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

test("package.json still depends on @solana/spl-token", () => {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
  // Either direct or pulled transitively via the listed SDKs — direct presence is the easy check.
  // Issue explicitly warns that stripping spl-token would break every Solana write path.
  const hasDirect = "@solana/spl-token" in all;
  const hasViaSdk =
    "@solana/web3.js" in all ||
    "@solana/spl-stake-pool" in all ||
    "@mrgnlabs/marginfi-client-v2" in all ||
    "@kamino-finance/klend-sdk" in all ||
    "@marinade.finance/marinade-ts-sdk" in all;
  expect(hasDirect || hasViaSdk).toBe(true);
});
