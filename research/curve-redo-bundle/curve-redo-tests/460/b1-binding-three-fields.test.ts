// Has kind/identifier/provenanceHint.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 binding three fields", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/kind[\s\S]*?identifier[\s\S]*?provenanceHint|identifier[\s\S]*?provenanceHint[\s\S]*?kind/);
});
