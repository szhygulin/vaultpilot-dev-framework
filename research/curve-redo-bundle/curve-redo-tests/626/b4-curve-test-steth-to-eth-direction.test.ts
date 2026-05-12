import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts covers steth_to_eth direction (ERC-20 → native)", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/steth_to_eth|ERC.20.*input|i:\s*['"]1['"]|i.*1.*j.*0/i);
});
