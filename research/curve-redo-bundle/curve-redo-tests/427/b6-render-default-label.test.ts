// Renderer fallback label.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 render default label", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/render.ts"), "utf8");
  expect(src).toMatch(/default[\s\S]*?on \$\{chain\}/);
});
