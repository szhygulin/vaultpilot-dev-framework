import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILES = [
  "README.md", "SECURITY.md", "DISCLAIMER.md", "LEGAL.md",
  "NOTICE.md", "TERMS.md", "CLAUDE.md", "AGENTS.md",
  "docs/disclaimer.md", "docs/legal.md", "docs/notice.md",
];
const docs = FILES.map((f) => {
  const p = join(root, f);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}).join("\n\n---\n\n");

test("docs require a neutral/unbiased/objective stance", () => {
  const m = /(neutral|unbiased|objective)\s+(tone|stance|content|information|perspective|posture|view|position)/i.test(docs)
    || /(maintain|keep|provide|preserve)\s+\w*\s*(neutrality|neutral|unbiased)/i.test(docs);
  expect(m).toBe(true);
});
