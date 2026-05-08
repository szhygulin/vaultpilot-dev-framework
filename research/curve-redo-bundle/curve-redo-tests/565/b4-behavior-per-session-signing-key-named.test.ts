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

test("per-session signing key for MCP-side response signing is referenced in source", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue body: "MCP-side response signing using a per-session key".
  const re = /per[\s_-]?session[\s\S]{0,500}(key|sign)|session[\s\S]{0,200}signing[\s\S]{0,200}key/i;
  expect(c).toMatch(re);
});
