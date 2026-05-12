// Reset-cache no-arg clears all.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 reset cache no arg clears", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/_resetAaveAbiCacheForTest[\s\S]*?variantCache\.clear/);
});
