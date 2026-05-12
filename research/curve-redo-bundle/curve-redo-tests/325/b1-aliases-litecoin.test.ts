// Litecoin aliases include 'LTC' and 'Litecoin Test'.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 aliases litecoin", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Litecoin Test[\s\S]*?LTC|LTC[\s\S]*?Litecoin Test/);
});
