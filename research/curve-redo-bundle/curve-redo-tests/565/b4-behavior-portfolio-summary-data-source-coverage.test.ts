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

test("get_portfolio_summary read-only tool is covered by data_source attestation in source", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Tool already exists in baseline — what must be added is the data_source field.
  expect(c).toContain("get_portfolio_summary");
  expect(c).toMatch(/data_source/);
});
