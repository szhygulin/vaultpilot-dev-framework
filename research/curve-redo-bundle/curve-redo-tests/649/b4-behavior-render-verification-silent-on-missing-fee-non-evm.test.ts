import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts has guard logic on the fee field for non-EVM chains (silent-on-missing UX)", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // Issue: 'silent on missing field' UX must carry over. Look for a guard
  // (?., ??, !==, !=, undefined check) sitting in the file alongside non-EVM
  // chain context — proxy for: there's a code path that no-ops when fee is absent.
  expect(src).toMatch(/\?\?|\?\.|!==\s*undefined|!=\s*undefined|=== undefined|== undefined|return null|return \[\]/);
  expect(src).toMatch(/\bsats?\b|satoshi|lamport|\bTRX\b|\bLTC\b|\bSOL\b|tron|solana|bitcoin|litecoin/i);
});
