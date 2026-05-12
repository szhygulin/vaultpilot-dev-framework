// Morpho supply tx has binding.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 morpho binding on supply tx", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/morpho/actions.ts"), "utf8");
  expect(src).toMatch(/buildMorphoSupply[\s\S]*?durableBindings/);
});
