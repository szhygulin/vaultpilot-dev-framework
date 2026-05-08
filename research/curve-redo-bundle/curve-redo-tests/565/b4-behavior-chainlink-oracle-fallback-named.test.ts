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

test("Chainlink price oracle is referenced near data_source / integrity / attestation context", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue body explicitly suggests Chainlink oracle as a price-data integrity fallback.
  const re = /chainlink[\s\S]{0,3000}(data_source|integrity|attestation|read[\s_-]?only)|(data_source|integrity|attestation|read[\s_-]?only)[\s\S]{0,3000}chainlink/i;
  expect(c).toMatch(re);
});
