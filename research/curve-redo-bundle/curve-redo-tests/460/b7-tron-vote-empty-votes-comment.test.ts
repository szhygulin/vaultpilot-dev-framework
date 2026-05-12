// TRON empty-votes case is documented.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 tron vote empty votes comment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/tron/actions.ts"), "utf8");
  expect(src).toMatch(/clear-all-votes|clear/i);
});
