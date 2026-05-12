// Renders Aave V3.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 render aave v3", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/render.ts"), "utf8");
  expect(src).toMatch(/Aave V3/);
});
