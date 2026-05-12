// makeDurableBinding exported.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 make binding exported", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/export\s+function\s+makeDurableBinding/);
});
