// Comment names rationale for trying 3 variants.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 abi comment three variants rationale", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/trial[- ]decode/i);
});
