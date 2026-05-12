// Doc mentions partial failure path.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 positions doc mentions partial", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/partial result|partial-failure|partial[\s-]?failure/i);
});
