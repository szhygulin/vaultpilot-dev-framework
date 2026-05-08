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

test("BTC prepare module references vsize/feeRate context AND surfaces a fee field", () => {
  const src = readAllTs(resolve(repoRoot, "src/modules/btc"));
  expect(src.length).toBeGreaterThan(0);
  expect(src).toMatch(/vsize|feeRate|sat\/vB|satPerVByte|satPerVbyte/i);
  expect(src).toMatch(/\bfee(?:Native|Btc|Bitcoin|Sats?|Satoshi|Amount|Total|Str|String)\b/);
});
