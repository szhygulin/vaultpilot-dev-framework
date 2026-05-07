import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("a disclaimer/legal/notice document is shipped at repo root", () => {
  const candidates = [
    "DISCLAIMER.md",
    "DISCLAIMER",
    "LEGAL.md",
    "LEGAL",
    "NOTICE.md",
    "NOTICE",
    "NOT_FINANCIAL_ADVICE.md",
    "COMPLIANCE.md",
    "docs/DISCLAIMER.md",
    "docs/LEGAL.md",
    "docs/disclaimer.md",
    "docs/legal.md",
  ];
  const found = candidates.some((p) => existsSync(join(repoRoot, p)));
  expect(found).toBe(true);
});
