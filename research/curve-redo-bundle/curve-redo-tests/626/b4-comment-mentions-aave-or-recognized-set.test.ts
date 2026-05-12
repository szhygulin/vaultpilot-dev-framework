// The rationale comment lists the recognized-destination set
// (Aave / Compound / Morpho / Lido / etc.) per the PR diff.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("rationale comment lists recognized-destination set", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/Aave|Compound|Morpho|Lido|EigenLayer|LiFi/i);
});
