import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CANDIDATES = [
  "DISCLAIMER.md", "LEGAL.md", "NOTICE.md", "TERMS.md",
  "docs/disclaimer.md", "docs/legal.md", "docs/notice.md", "docs/terms.md",
  "DISCLAIMER", "LEGAL", "NOTICE",
];

test("a standalone legal/disclaimer/notice document exists", () => {
  const found = CANDIDATES.some((f) => existsSync(join(root, f)));
  expect(found).toBe(true);
});
