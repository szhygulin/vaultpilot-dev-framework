// TRON maps over votes.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 tron iterates votes", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/tron/actions.ts"), "utf8");
  expect(src).toMatch(/args\.votes\.map/);
});
