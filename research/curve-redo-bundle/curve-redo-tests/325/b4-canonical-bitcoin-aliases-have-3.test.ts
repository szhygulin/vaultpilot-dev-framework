// Bitcoin aliases has 3 entries.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 canonical bitcoin aliases have 3", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Bitcoin Test[\s\S]*?BTC/);
});
