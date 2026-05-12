// The fix's rationale comment mentions classifyDestination explicitly per
// PR #628's added doc block.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("classifyDestination is referenced in actions.ts (in a comment)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/classifyDestination/);
});
