// durableBindings is DurableBinding[].
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 types durable bindings array", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types/index.ts"), "utf8");
  expect(src).toMatch(/durableBindings\s*\?\s*:\s*import\([^)]+durable-binding[^)]+\)\.DurableBinding\[\]/);
});
