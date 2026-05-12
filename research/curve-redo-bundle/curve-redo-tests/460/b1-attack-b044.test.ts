// TRON cites b044.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 attack b044", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/b044/);
});
