import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function collect(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test" || name === "test-results" || name === "dist" || name === "build") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full, exts));
    else if (exts.some((e) => name.endsWith(e))) {
      try { out.push(readFileSync(full, "utf8")); } catch { /* ignore */ }
    }
  }
  return out;
}

test("shipped sources/docs assert content is informational/educational only", () => {
  const blobs = collect(repoRoot, [".ts", ".md", ".json"]).join("\n").toLowerCase();
  const hits = [
    "informational purposes",
    "informational only",
    "educational purposes",
    "educational only",
    "for information",
  ].some((needle) => blobs.includes(needle));
  expect(hits).toBe(true);
});
