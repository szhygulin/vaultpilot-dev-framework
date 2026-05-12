// Error lists tried variants.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 abi error cites variants list", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/v3,\s*v3\.2,\s*v3\.3|v3.*v3\.2.*v3\.3/);
});
