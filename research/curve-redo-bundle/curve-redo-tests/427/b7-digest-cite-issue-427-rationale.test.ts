// Digest comment cites cross-protocol coverage rationale.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 digest cite issue 427 rationale", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/cross-protocol|Issue #427|#427/);
});
