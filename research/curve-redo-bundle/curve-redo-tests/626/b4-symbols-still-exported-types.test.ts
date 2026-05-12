import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("actions.ts still exposes a type or interface (no removal)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/UnsignedTx|interface\s+\w+|type\s+\w+\s*=/);
});
