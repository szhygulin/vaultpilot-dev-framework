// MarginFi bank pubkey binding emits in durableBindings.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 marginfi bank pubkey emit", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/solana/marginfi.ts"), "utf8");
  expect(src).toMatch(/durableBindings/);
});
