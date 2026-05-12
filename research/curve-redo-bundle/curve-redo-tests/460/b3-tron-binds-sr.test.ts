// TRON vote binds SR.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 tron binds sr", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/tron/actions.ts"), "utf8");
  expect(src).toMatch(/tron-super-representative-address/);
});
