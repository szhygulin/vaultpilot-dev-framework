// UnsignedTronTx.durableBindings.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 types tron tx durable", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types/index.ts"), "utf8");
  expect(src).toMatch(/UnsignedTronTx[\s\S]*?durableBindings\s*\?\s*:/);
});
