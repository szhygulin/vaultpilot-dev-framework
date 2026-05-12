// Bitcoin minVersion 2.x.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 bitcoin min 2x", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Bitcoin[\s\S]*?minVersion\s*:\s*["']2\./);
});
