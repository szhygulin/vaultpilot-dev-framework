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

test("data_source attestation includes a 'block_height' sub-field for chain-state pinning", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  const re = /data_source[\s\S]{0,1500}block_height|block_height[\s\S]{0,1500}data_source/;
  expect(c).toMatch(re);
});
