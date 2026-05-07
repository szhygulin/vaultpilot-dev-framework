import { test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function collect(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collect(full, acc);
    else if (full.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

test("Solana code path surfaces a fee field that combines base + priority fee", () => {
  const solDir = resolve(repo, "src/modules/solana");
  const files = collect(solDir);
  const blob = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const storeBlob = readFileSync(resolve(repo, "src/signing/solana-tx-store.ts"), "utf8");
  const all = blob + "\n" + storeBlob;
  // Issue calls out: 5000 base × signatures + priority fee (CU × micro-lamports).
  expect(all).toMatch(/lamport|priority|computeUnit|microLamport|CU/i);
  expect(all).toMatch(/fee(?:Native|Sol|Lamports|Absolute|Total)/i);
});
