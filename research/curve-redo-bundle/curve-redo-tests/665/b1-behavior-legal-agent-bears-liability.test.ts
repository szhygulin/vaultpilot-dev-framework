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

test("docs assign responsibility for advice to the agent/LLM", () => {
  const a = /(agent|llm|language\s+model|\bmodel\b)[\s\S]{0,200}(bears?|carries?|holds?|takes?|is|are)\s+\w*\s*(liab|responsib)/i.test(docs);
  const b = /(liability|responsibility)\s+for\s+(advice|recommendations|outputs?)[\s\S]{0,200}(agent|llm|language\s+model|\bmodel\b)/i.test(docs);
  expect(a || b).toBe(true);
});
