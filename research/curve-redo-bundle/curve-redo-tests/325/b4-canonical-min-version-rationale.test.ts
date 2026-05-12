// Bitcoin min-version rationale cites wallet-policy / PSBT.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 canonical min version rationale", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/wallet-policy|PSBT/i);
});
