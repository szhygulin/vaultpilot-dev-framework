// Protocol union in schema.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 schemas union", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/schemas.ts"), "utf8");
  expect(src).toMatch(/aave-v3[\s\S]*?compound-v3[\s\S]*?morpho-blue[\s\S]*?marginfi[\s\S]*?kamino/);
});
