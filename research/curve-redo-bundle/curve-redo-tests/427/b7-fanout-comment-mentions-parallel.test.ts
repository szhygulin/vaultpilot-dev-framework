// Comment mentions 'parallel' fan-out.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 fanout comment mentions parallel", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/parallel|fan-out|fans out/i);
});
