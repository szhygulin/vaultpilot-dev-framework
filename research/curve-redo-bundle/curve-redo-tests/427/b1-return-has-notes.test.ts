// Return type exposes notes.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 return has notes", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/getHealthAlerts[\s\S]*?notes\s*\?\s*:\s*string\[\]/);
});
