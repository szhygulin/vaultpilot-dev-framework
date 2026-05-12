// Tool desc names protocols.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 index mentions protocols", () => {
  const src = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
  expect(src).toMatch(/get_health_alerts[\s\S]*?(Compound V3[\s\S]*?Morpho|Morpho[\s\S]*?Compound V3)/);
});
