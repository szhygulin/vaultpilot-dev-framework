import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("actions.ts has no obvious half-edit fragments (no '<<<<<<<' / merge markers)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
});
