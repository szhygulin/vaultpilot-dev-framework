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

test("ENS source has both a positive attestation marker and the not-attested marker", () => {
  const corpus = walkSrc().map((f) => readFileSync(f, "utf-8")).join("\n");
  expect(corpus).toContain("data-source-not-attested");
  // A positive counterpart: 'multi-rpc-consensus' or 'attested' or 'verified' marker string
  expect(corpus).toMatch(/(multi[-_]rpc[-_]consensus|consensus[-_]attested|attested[-_]by|attested[-_]rpcs?|cross[-_]checked|verified[-_]by[-_]rpcs?|rpc[-_]consensus|attested\s*:\s*true)/i);
});
