// Signature (kind, identifier).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 make binding signature", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/makeDurableBinding\s*\(\s*kind\s*:\s*DurableBindingKind\s*,\s*identifier\s*:\s*string\s*\)/);
});
