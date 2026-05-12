// DB doc mentions skill consumption.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 binding doc mentions skill", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/[Ss]kill/);
});
