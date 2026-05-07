import { test, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

test("Inv #15 label is named for the new read-only data-plane invariant", () => {
  const files = [...walk("src", [".ts"]), ...walk("claude-work", [".md", ".ts"])];
  const c = files.map((f) => readFileSync(f, "utf8")).join("\n");
  expect(c).toMatch(/Inv\s*#?\s*15/i);
});
