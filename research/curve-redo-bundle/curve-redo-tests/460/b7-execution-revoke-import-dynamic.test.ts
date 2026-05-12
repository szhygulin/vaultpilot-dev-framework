// execution imports via dynamic import for revoke.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 execution revoke import dynamic", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/execution/index.ts"), "utf8");
  expect(src).toMatch(/import\(\s*["'].*durable-binding/);
});
