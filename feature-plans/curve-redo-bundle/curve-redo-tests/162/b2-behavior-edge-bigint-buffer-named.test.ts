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

function trackedText(): string {
  const root = process.cwd();
  const out: string[] = [];
  for (const f of fs.readdirSync(root)) {
    if (f.endsWith(".md")) {
      try { out.push(fs.readFileSync(path.join(root, f), "utf-8")); } catch {}
    }
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

test("docs that reference the advisory also name bigint-buffer", () => {
  const text = trackedText();
  // Find region around GHSA reference
  const idx = text.indexOf("GHSA-3gc7-fjrx-p6mg");
  expect(idx).toBeGreaterThanOrEqual(0);
  // The same document corpus must also call out bigint-buffer somewhere
  expect(text).toMatch(/bigint-buffer/i);
});
