// Tool desc cites #427.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 index cite 427", () => {
  const src = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
  expect(src).toMatch(/get_health_alerts[\s\S]*?(#427|Issue 427)/);
});
