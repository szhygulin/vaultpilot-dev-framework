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

test("defense_layer concept is named alongside data_source attestation in source", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue: defense_layer = none means baseline lacks layer; fix should set layer when attestation present.
  const re = /defense[\s_-]?layer[\s\S]{0,3000}data_source|data_source[\s\S]{0,3000}defense[\s_-]?layer/i;
  expect(c).toMatch(re);
});
