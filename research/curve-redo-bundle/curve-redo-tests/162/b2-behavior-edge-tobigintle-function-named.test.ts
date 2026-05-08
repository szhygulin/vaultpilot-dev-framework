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
    if (f.endsWith(".md")) {
      try { out.push(fs.readFileSync(path.join(root, f), "utf-8")); } catch {}
    }
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

test("toBigIntLE function name is documented", () => {
  expect(docs()).toMatch(/toBigIntLE/);
});
