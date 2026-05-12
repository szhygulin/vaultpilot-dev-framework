// Catch potential typos: no 'aknowledged' / 'acknowledgement' (sic).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("no aknowledged (typo) variants in source", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).not.toMatch(/aknowledged|aknowlegded|acknowlegded/);
});
