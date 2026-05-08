import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readAllTs(dir: string): string {
  let out = "";
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name);
    if (e.isDirectory()) out += readAllTs(fp);
    else if (e.isFile() && fp.endsWith(".ts")) out += fs.readFileSync(fp, "utf8") + "\n";
  }
  return out;
}

test("Solana prepare path references priority-fee / compute-unit math when surfacing the fee", () => {
  const src = readAllTs(resolve(repoRoot, "src/modules/solana"));
  expect(src.length).toBeGreaterThan(0);
  // Issue: 'lamports (5000 base × signature count) plus priority fee
  // (compute units × micro-lamports/CU)'.
  expect(src).toMatch(/priority|compute\s*unit|micro[\s-]?lamport|\bCU\b/i);
  expect(src).toMatch(/\bfee(?:Native|Sol|Solana|Lamports|Amount|Total|Str|String)\b/);
});
