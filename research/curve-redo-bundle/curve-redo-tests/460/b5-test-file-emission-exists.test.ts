// emission test file exists.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 test file emission exists", () => {
  const src = readFileSync(resolve(process.cwd(), "test/durable-binding-emission.test.ts"), "utf8");
  expect(src).toMatch(/durableBindings/);
});
