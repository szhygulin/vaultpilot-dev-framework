// PROVENANCE_HINTS Record<kind>.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 provenance record", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/PROVENANCE_HINTS[\s\S]*?Record<\s*DurableBindingKind/);
});
