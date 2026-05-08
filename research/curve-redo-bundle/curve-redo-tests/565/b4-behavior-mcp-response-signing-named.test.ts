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

test("MCP-side response signing for read-only data plane is referenced", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue body option (a): "MCP-side response signing".
  const re = /mcp[\s\S]{0,200}response[\s\S]{0,200}sign|response[\s\S]{0,200}sign[\s\S]{0,200}mcp|sign[\s\S]{0,200}mcp[\s\S]{0,200}response/i;
  expect(c).toMatch(re);
});
