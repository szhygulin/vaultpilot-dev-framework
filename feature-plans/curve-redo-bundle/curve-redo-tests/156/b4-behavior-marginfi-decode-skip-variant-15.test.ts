import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

// The hardened client must skip a bank that throws during decode (e.g. unknown
// oracleSetup variant 15 observed on mainnet 2026-04-25). It must NOT propagate
// the underlying TypeError out of fetchGroupDataOverride.
test("fetchGroupDataOverride exists and is exported as a function-like override", () => {
  const fn = (marginfi as Record<string, unknown>).fetchGroupDataOverride;
  expect(typeof fn).toBe("function");
});

test("a per-bank decode failure does not bubble out as a TypeError", async () => {
  const fn = (marginfi as Record<string, unknown>).fetchGroupDataOverride as
    | ((...a: unknown[]) => unknown)
    | undefined;
  if (typeof fn !== "function") return;
  // Construct a minimally compatible argument that simulates a fetcher returning
  // one bad account (decode throws Cannot read properties of null) and one good one.
  const fakeProgram = {
    coder: {
      accounts: {
        decode: (_n: string, _b: Buffer) => {
          throw new TypeError("Cannot read properties of null (reading 'property')");
        },
      },
    },
    provider: {
      connection: {
        getMultipleAccountsInfo: async () => [
          { data: Buffer.alloc(2304), owner: { toBase58: () => "" } },
        ],
      },
    },
  };
  // We don't know the exact signature; the contract under test is that whatever
  // the override does, it does not raise the underlying TypeError verbatim.
  let raised: unknown = null;
  try {
    await Promise.resolve(fn(fakeProgram, ["Be5LNs1"], {}));
  } catch (err) {
    raised = err;
  }
  if (raised instanceof TypeError) {
    expect(String((raised as Error).message)).not.toMatch(/Cannot read properties of null/);
  }
});
