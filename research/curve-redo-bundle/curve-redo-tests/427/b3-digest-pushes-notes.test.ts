// Digest pushes notes.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 digest pushes notes", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/notes\.push\(\s*\.\.\.r\.notes/);
});
