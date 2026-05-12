// Below-min message mentions Ledger Live.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 canonical throws msg update via ledger live", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Ledger Live/);
});
