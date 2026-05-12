// DB doc names what's NOT covered (native sends).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 binding doc mentions out of scope", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/native-coin sends|Invariant #1|Inv #1/);
});
