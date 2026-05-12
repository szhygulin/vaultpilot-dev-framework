// Compound binding sits on action tx, not approve.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 compound bindings on action not approve", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/compound/actions.ts"), "utf8");
  expect(src).toMatch(/durableBindings[\s\S]*?market/);
});
