// Bitcoin aliases include 'BTC' and 'Bitcoin Test'.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 aliases bitcoin", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Bitcoin Test[\s\S]*?BTC|BTC[\s\S]*?Bitcoin Test/);
});
