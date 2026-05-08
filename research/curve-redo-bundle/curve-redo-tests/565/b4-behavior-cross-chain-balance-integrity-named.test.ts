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

test("cross-chain balance integrity / attestation is referenced for the daily-briefing surface", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  const re = /cross[\s_-]?chain[\s_-]?balance[\s\S]{0,1000}(integrity|attestation|spoof|divergence|consensus|data_source)|(integrity|attestation|spoof|divergence|consensus|data_source)[\s\S]{0,1000}cross[\s_-]?chain[\s_-]?balance/i;
  expect(c).toMatch(re);
});
