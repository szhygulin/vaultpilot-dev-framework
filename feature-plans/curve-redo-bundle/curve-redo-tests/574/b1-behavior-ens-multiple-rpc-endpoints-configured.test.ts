import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

function walkSrc(): string[] {
  const root = join(process.cwd(), "src");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: any[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && p.endsWith(".ts")) out.push(p);
    }
  }
  return out;
}

test("ENS resolution wires through multiple RPC endpoints", () => {
  const ensFiles = walkSrc().filter((f) => {
    const c = readFileSync(f, "utf-8");
    return /resolve_?ens|reverse_?resolve_?ens/i.test(c);
  });
  const corpus = ensFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
  // Need at least 2 RPCs / clients / providers / endpoints
  expect(corpus).toMatch(/(rpcs|clients|providers|endpoints|urls)\s*[:=]\s*\[|forEach|Promise\.all|Promise\.allSettled/i);
  expect(corpus).toMatch(/(>=\s*2|at\s*least\s*2|two\s+rpc|second\s+rpc|multi[-_]?rpc)/i);
});
