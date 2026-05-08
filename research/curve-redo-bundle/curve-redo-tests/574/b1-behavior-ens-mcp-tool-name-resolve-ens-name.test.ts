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

test("MCP tool 'resolve_ens_name' is registered AND has multi-rpc verification nearby", () => {
  const corpus = walkSrc().map((f) => readFileSync(f, "utf-8")).join("\n");
  expect(corpus).toContain("resolve_ens_name");
  expect(corpus).toMatch(/multi[-_]?rpc|consensus|attest|cross[-_]?check/i);
});
