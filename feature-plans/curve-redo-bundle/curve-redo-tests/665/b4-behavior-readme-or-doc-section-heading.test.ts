import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function collect(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test-results" || name === "dist" || name === "build") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full));
    else if (name.endsWith(".md")) {
      try { out.push(readFileSync(full, "utf8")); } catch { /* ignore */ }
    }
  }
  return out;
}

test("a markdown heading dedicated to disclaimer/legal exists somewhere", () => {
  const md = collect(repoRoot).join("\n");
  const headingRegex = /^#{1,6}\s+.*(disclaimer|legal|not\s+financial\s+advice|not\s+investment\s+advice|liability|compliance)/im;
  expect(headingRegex.test(md)).toBe(true);
});
