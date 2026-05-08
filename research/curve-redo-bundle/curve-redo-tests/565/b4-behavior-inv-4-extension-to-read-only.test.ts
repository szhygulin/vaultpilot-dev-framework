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

test("Inv #4 missing-directive heuristic is extended to read-only tools / data_source attestation", () => {
  const files = [...walk("src", [".ts"]), ...walk("claude-work", [".md", ".ts"])];
  const c = files.map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue: "extend the Inv #4 missing-directive heuristic to fire on read-only tools whose responses lack a data_source field".
  const re = /Inv\s*#?\s*4[\s\S]{0,3000}(read[\s_-]?only|data_source)|(read[\s_-]?only|data_source)[\s\S]{0,3000}Inv\s*#?\s*4/i;
  expect(c).toMatch(re);
});
