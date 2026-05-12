// Unknown app error suggests installing via Manager.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 canonical throw unknown update", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Ledger Live \(Manager\)/);
});
