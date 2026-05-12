// The fix must NOT remove the existing spender-allowlist ack (#618);
// both flags coexist on different transaction legs.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("existing acknowledgedNonAllowlistedSpender on approve leg is preserved", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonAllowlistedSpender/);
});
