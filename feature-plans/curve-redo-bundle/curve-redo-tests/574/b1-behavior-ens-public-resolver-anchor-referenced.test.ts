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

test("source references a canonical ENS resolver or safe anchor", () => {
  const corpus = walkSrc().map((f) => readFileSync(f, "utf-8")).join("\n");
  // Either the textual 'safe anchor' / 'public resolver' reference, OR a known canonical resolver address
  const hasAnchor = /safe[-_ ]?anchor|public[-_ ]?resolver|canonical[-_ ]?resolver/i.test(corpus);
  const hasKnownAddr = /0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63|0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41|0x30200E0cb040F38E474E53EF437c95A1bE723b2B/i.test(corpus);
  expect(hasAnchor || hasKnownAddr).toBe(true);
});
