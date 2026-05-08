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

test("resolveEnsName / resolve_ens_name function is defined in the source tree", () => {
  const corpus = walkSrc().map((f) => readFileSync(f, "utf-8")).join("\n");
  // Either an export of the function, or registration of a tool with the canonical name
  const hasFnDef = /\b(function|const|async\s+function)\s+resolveEnsName\b/.test(corpus) ||
                   /\bresolveEnsName\s*[:=]/.test(corpus) ||
                   /"resolve_ens_name"|'resolve_ens_name'|`resolve_ens_name`/.test(corpus);
  expect(hasFnDef).toBe(true);
});
