import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md pre-sign-gate rule names its 'Tells' section or markers", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/Tells|tells:|direction|named direction/i);
});
