import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILES = ["AGENTS.md", "CLAUDE.md"];
const docs = FILES.map((f) => {
  const p = join(root, f);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}).join("\n\n---\n\n");

test("AGENTS.md or CLAUDE.md instructs agent on neutrality / no advice", () => {
  const m = /(neutral|unbiased|objective)/i.test(docs)
    && /(advice|advisor|adviser|recommend|financial)/i.test(docs);
  expect(m).toBe(true);
});
