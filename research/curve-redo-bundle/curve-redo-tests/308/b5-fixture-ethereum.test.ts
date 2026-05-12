// Ethereum fixture.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 fixture ethereum", () => {
  const src = readFileSync(resolve(process.cwd(), "test/fixtures/aave/getReservesData-ethereum.hex"), "utf8");
  expect(src).toMatch(/0x/);
});
