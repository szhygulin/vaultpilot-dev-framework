// Args.expectedNames optional readonly.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 args expected names", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/expectedNames\s*\?\s*:\s*readonly\s+string\[\]/);
});
