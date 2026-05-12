// positions doc cites issue 427 rationale.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 positions cite issue 427 doc", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/was Aave[- ]V3[- ]only|Aave-V3-only|false safety reassurance/i);
});
