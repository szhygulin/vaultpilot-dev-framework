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

test("reverseResolveEns / reverse_resolve_ens function is defined in the source tree", () => {
  const corpus = walkSrc().map((f) => readFileSync(f, "utf-8")).join("\n");
  const hasFnDef = /\b(function|const|async\s+function)\s+reverseResolveEns\b/.test(corpus) ||
                   /\breverseResolveEns\s*[:=]/.test(corpus) ||
                   /"reverse_resolve_ens"|'reverse_resolve_ens'|`reverse_resolve_ens`/.test(corpus);
  expect(hasFnDef).toBe(true);
});
