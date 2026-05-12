// Curve mainnet swap chain is ethereum; verify still wired.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("swap-tx chain field reads 'ethereum'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/chain\s*:\s*"ethereum"/);
});
