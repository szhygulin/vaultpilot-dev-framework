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

test("ENS resolution code references multi-RPC consensus", () => {
  const files = walkSrc().filter((f) => /ens|resolver|contacts/i.test(f));
  const all = files.map((f) => readFileSync(f, "utf-8")).join("\n");
  expect(all).toMatch(/multi[-_]?rpc|multi[-_]?source|consensus/i);
});
