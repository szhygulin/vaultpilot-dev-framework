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

test("ENS resolution refuses / errors when RPCs diverge", () => {
  const ensFiles = walkSrc().filter((f) => {
    const c = readFileSync(f, "utf-8");
    return /resolve_?ens|reverse_?resolve_?ens/i.test(c);
  });
  const corpus = ensFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
  // refusal mechanism: throw / refuse / reject keyword combined with divergence/mismatch
  const hasRefusal = /\b(throw|refuse|reject|abort|fail)\b/i.test(corpus);
  const hasDivergence = /\b(diverg|mismatch|disagree|inconsistent|!==|!=)/i.test(corpus);
  expect(hasRefusal && hasDivergence).toBe(true);
});
