// Bitcoin knownGood.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 bitcoin known good", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Bitcoin[\s\S]*?knownGood\s*:\s*\[/);
});
