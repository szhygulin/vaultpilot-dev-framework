import { test, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("'cached baseline' cross-check is named as a read-only integrity option", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue body explicitly suggests "cached baseline + multi-RPC consensus".
  expect(c).toMatch(/cached?[\s_-]?baseline/i);
});
