// types.ts doc-comment mentions skill.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 types binding doc mentions skill", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types/index.ts"), "utf8");
  expect(src).toMatch(/skill/i);
});
