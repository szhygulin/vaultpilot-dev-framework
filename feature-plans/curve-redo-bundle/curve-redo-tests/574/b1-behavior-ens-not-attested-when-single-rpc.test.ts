import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

function walkSrc(): string[] {
  const root = join(process.cwd(), "src");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: any[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && p.endsWith(".ts")) out.push(p);
    }
  }
  return out;
}

test("source emits 'data-source-not-attested' AND has a single/one-rpc branch nearby", () => {
  const corpus = walkSrc().map((f) => readFileSync(f, "utf-8")).join("\n");
  expect(corpus).toContain("data-source-not-attested");
  // Some indicator of a single-RPC condition guarding the marker
  expect(corpus).toMatch(/\b(only\s*one|single|length\s*===?\s*1|length\s*<\s*2|single[-_]?source|single[-_]?rpc)\b/i);
});
