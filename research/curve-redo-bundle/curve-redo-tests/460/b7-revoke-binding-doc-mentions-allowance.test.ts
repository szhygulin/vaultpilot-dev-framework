// revoke binding comment cites allowance set.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 revoke binding doc mentions allowance", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/execution/index.ts"), "utf8");
  expect(src).toMatch(/allowance set|allowance|spender|approval/i);
});
