import { test, expect } from "vitest";
import { findBankForMint } from "../src/modules/solana/marginfi.js";

/**
 * The issue states (marginfi.ts:769-777) that findBankForMint surfaces the message
 * "skipped at decode — MarginFi shipped an on-chain schema update" for skipped
 * banks. We construct a fake group whose only candidate bank is in the skip set
 * and confirm the returned error/message mentions schema drift.
 */
test("findBankForMint returns an error mentioning 'skipped' or 'schema update' when the only matching bank was skipped at decode", () => {
  // We pass a synthetic group object with the canonical shape:
  //   - empty `banks` map (no decodable bank)
  //   - non-empty `skipped` list whose entry's mint matches the lookup mint.
  const fakeMint = "So11111111111111111111111111111111111111112";
  const group = {
    banks: new Map(),
    skipped: [
      {
        bankAddress: "4cSk2pZpFakeBankAddrXXXXXXXXXXXXXXXXXXXXXXX",
        mint: fakeMint,
        oracleSetup: 15,
        step: "decode",
      },
    ],
  };
  let result: unknown;
  let err: unknown = null;
  try {
    result = (findBankForMint as (m: string, g: unknown) => unknown)(fakeMint, group);
  } catch (e) {
    err = e;
  }
  const text = JSON.stringify({ result, err: err instanceof Error ? err.message : err });
  expect(/skipp|schema|decode|drift|update/i.test(text)).toBe(true);
});
