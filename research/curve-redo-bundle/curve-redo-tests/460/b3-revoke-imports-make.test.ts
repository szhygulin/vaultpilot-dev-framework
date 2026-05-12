// revoke imports makeDurableBinding.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 revoke imports make", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/execution/index.ts"), "utf8");
  expect(src).toMatch(/makeDurableBinding/);
});
