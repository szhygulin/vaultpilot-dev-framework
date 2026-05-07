import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CANDIDATES = [
  "DISCLAIMER.md", "LEGAL.md", "NOTICE.md", "TERMS.md",
  "docs/disclaimer.md", "docs/legal.md", "docs/notice.md", "docs/terms.md",
];

test("the legal/disclaimer document has substantive content (>= 200 chars)", () => {
  const lengths = CANDIDATES.map((f) => {
    const p = join(root, f);
    return existsSync(p) ? readFileSync(p, "utf8").length : 0;
  });
  const max = Math.max(0, ...lengths);
  expect(max).toBeGreaterThanOrEqual(200);
});
