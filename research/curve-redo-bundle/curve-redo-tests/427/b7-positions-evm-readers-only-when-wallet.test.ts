// EVM readers gated by wallet.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 positions evm readers only when wallet", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/args\.wallet\s*\?\s*\[/);
});
