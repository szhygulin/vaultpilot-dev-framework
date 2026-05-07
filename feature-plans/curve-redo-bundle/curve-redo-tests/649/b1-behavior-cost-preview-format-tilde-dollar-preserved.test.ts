import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts continues to use the ~$ USD prefix used by EVM block", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  // The EVM format uses ~$ before USD figure; new chains must reuse the convention.
  expect(src).toMatch(/~\$|~\\\$|tilde.*dollar|`~\$/);
});
