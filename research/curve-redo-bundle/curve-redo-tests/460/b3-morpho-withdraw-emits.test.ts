// Morpho withdraw.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 morpho withdraw emits", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/morpho/actions.ts"), "utf8");
  expect(src).toMatch(/buildMorphoWithdraw[\s\S]*?durableBindings/);
});
