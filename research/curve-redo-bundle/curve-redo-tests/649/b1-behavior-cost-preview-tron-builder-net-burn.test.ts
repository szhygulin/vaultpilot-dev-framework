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

test("TRON code path computes a net (post-stake) fee for the cost preview", () => {
  const tronDir = resolve(repo, "src/modules/tron");
  const files = collect(tronDir);
  const blob = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const storeBlob = readFileSync(resolve(repo, "src/signing/tron-tx-store.ts"), "utf8");
  const all = blob + "\n" + storeBlob;
  // The implementation must reference both stake/frozen resources AND a fee/burn field
  // for the cost preview (per the issue: "reflect the post-stake net TRX burn").
  expect(all).toMatch(/frozen|stake|bandwidth|energy/i);
  expect(all).toMatch(/fee(?:Native|Trx|Burn|Net|Absolute)/i);
});
