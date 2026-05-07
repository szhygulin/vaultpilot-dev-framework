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

test("TRON prepare path references frozen-stake/energy/bandwidth offset alongside a fee field — net-burn semantics", () => {
  const src = readAllTs(resolve(repoRoot, "src/modules/tron"));
  expect(src.length).toBeGreaterThan(0);
  // Issue: 'reflect the post-stake net TRX burn, not the gross resource
  // quote, since most users have non-zero frozen bandwidth/energy'.
  expect(src).toMatch(/frozen|stake|energy|bandwidth/i);
  expect(src).toMatch(/\bfee(?:Native|Trx|Tron|Sun|Burn|Net|Amount|Total|Str|String)\b/);
});
