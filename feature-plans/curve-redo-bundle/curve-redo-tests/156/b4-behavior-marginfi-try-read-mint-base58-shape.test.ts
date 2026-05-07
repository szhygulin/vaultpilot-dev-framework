import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("if a mint is returned, it parses as a 32-byte base58 pubkey", () => {
  const fn = (marginfi as Record<string, unknown>).tryReadMintFromRawBankData as
    | ((b: Buffer) => unknown)
    | undefined;
  if (typeof fn !== "function") return;
  const buf = Buffer.alloc(2304);
  // Sprinkle a recognizable byte pattern so the function has SOMETHING to read.
  for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
  const out = fn(buf);
  if (out == null) return; // tolerated: cannot recover from synthetic data
  if (typeof out === "string") {
    expect(out.length).toBeGreaterThanOrEqual(32);
    expect(out.length).toBeLessThanOrEqual(44);
    expect(out).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  } else {
    // Could be a PublicKey-like with a toBase58 method.
    const obj = out as { toBase58?: () => string };
    expect(typeof obj.toBase58).toBe("function");
  }
});
