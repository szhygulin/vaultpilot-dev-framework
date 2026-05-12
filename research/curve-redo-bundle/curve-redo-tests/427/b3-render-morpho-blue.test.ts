// Renders Morpho Blue.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 render morpho blue", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/render.ts"), "utf8");
  expect(src).toMatch(/Morpho Blue/);
});
