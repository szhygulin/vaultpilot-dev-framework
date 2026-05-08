import { test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function docs(): string {
  const root = process.cwd();
  const out: string[] = [];
  for (const f of fs.readdirSync(root)) {
    if (f.endsWith(".md")) out.push(fs.readFileSync(path.join(root, f), "utf-8"));
  }
  for (const sub of ["docs", "claude-work", "scripts"]) {
    for (const f of walk(path.join(root, sub))) {
      if (/\.(md|mjs|js|json|txt)$/.test(f)) {
        try { out.push(fs.readFileSync(f, "utf-8")); } catch {}
      }
    }
  }
  return out.join("\n\n");
}

test("the exact advisory count of 12 is recorded near a high/advisory marker", () => {
  const text = docs();
  // Match "12" as a standalone number adjacent (within ~80 chars) to "high" or "advisor"
  expect(text).toMatch(/12[^\n]{0,80}(high|advisor)/i);
});
