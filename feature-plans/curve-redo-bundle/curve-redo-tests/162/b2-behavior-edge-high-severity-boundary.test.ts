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

function nearAdvisory(text: string): string {
  const segments: string[] = [];
  const re = /(GHSA-3gc7-fjrx-p6mg|bigint-buffer|toBigIntLE)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = Math.max(0, m.index - 4000);
    const end = Math.min(text.length, m.index + 4000);
    segments.push(text.slice(start, end));
  }
  return segments.join("\n---\n");
}

function docs(): string {
  const root = process.cwd();
  const out: string[] = [];
  for (const f of fs.readdirSync(root)) {
    if (f.endsWith(".md")) out.push(fs.readFileSync(path.join(root, f), "utf-8"));
  }
  for (const sub of ["docs", "claude-work"]) {
    for (const f of walk(path.join(root, sub))) {
      if (/\.md$/.test(f)) {
        try { out.push(fs.readFileSync(f, "utf-8")); } catch {}
      }
    }
  }
  return out.join("\n\n");
}

test("severity (high) is called out near the advisory", () => {
  expect(nearAdvisory(docs())).toMatch(/\bhigh[- ]?(severity|sev)?\b/i);
});
