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

function corpus(): string {
  return walk("src").map((f) => readFileSync(f, "utf8")).join("\n=====\n");
}

test("data_source attestation schema declares provider, block_height, and signature in proximity", () => {
  const c = corpus();
  // Per issue: read-only MCP responses must include `data_source: {provider, block_height, signature}`.
  const re = /data_source[\s\S]{0,3000}provider[\s\S]{0,3000}block_height[\s\S]{0,3000}signature/;
  expect(c).toMatch(re);
});
