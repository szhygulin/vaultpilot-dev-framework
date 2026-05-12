// Protocol union covers 5.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 protocol union 5", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/aave-v3[\s\S]*?compound-v3[\s\S]*?morpho-blue[\s\S]*?marginfi[\s\S]*?kamino/);
});
