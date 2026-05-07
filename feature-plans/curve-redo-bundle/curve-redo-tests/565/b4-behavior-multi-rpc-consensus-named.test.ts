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

test("multi-RPC consensus is named as a cross-check option for read-only integrity", () => {
  const c = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
  // Issue body explicitly suggests "multi-RPC consensus" as a defense option.
  expect(c).toMatch(/multi[\s_-]?rpc[\s_-]?consensus/i);
});
