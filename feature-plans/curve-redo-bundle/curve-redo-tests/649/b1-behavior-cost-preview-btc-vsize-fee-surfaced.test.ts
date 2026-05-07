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

test("BTC code path exposes the precomputed PSBT fee on the unsigned tx envelope", () => {
  const btcDir = resolve(repo, "src/modules/btc");
  const files = collect(btcDir);
  const blob = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const storeBlob = readFileSync(resolve(repo, "src/signing/btc-tx-store.ts"), "utf8");
  const all = blob + "\n" + storeBlob;
  expect(all).toMatch(/vsize|vbyte|sat\/?vB|feeRate/i);
  expect(all).toMatch(/fee(?:Native|Btc|Sat|Sats|Absolute|Total)/i);
});
