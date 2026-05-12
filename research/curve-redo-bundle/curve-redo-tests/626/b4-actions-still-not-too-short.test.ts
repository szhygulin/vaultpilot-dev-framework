import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/modules/curve/actions.ts is non-trivial in size (over 100 lines)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src.split("\n").length).toBeGreaterThan(100);
});
