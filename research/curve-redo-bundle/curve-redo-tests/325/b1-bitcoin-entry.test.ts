// Bitcoin entry.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 bitcoin entry", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Bitcoin\s*:\s*\{/);
});
