import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function collect(dir: string, exts: string[]): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test" || name === "test-results" || name === "dist" || name === "build") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full, exts));
    else if (exts.some((e) => name.endsWith(e))) {
      try { out.push({ path: full, text: readFileSync(full, "utf8") }); } catch { /* ignore */ }
    }
  }
  return out;
}

test("a file co-locates 'agent' with responsibility/liability language", () => {
  const files = collect(repoRoot, [".ts", ".md", ".json"]);
  const colocated = files.some(({ text }) => {
    const t = text.toLowerCase();
    if (!t.includes("agent")) return false;
    return [
      "liability",
      "liable",
      "responsible",
      "responsibility",
      "accountab",
    ].some((needle) => t.includes(needle));
  });
  expect(colocated).toBe(true);
});
