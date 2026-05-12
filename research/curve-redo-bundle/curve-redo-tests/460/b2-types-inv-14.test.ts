// types mentions Invariant #14.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 types inv 14", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types/index.ts"), "utf8");
  expect(src).toMatch(/Invariant\s*#?14|Inv\s*#?14/i);
});
