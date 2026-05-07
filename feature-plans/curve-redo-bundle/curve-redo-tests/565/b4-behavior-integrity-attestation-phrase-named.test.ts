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

test("integrity attestation concept is named in source", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  expect(c).toMatch(/integrity[\s_-]?attestation|attestation[\s_-]?integrity/i);
});
