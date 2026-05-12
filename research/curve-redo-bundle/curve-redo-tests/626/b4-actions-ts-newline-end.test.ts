import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("actions.ts ends with a newline (file-formatting hygiene)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src.endsWith("\n")).toBe(true);
});
