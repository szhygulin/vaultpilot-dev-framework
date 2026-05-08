import { test, expect } from "vitest";
import { fetchGroupDataOverride } from "../src/modules/solana/marginfi.js";

/**
 * fetchGroupDataOverride is the hardened replacement: it must skip per-bank rather
 * than throwing the SDK's `TypeError: Cannot read properties of null` when a
 * bank carries unknown oracleSetup. We pass a minimal stub program/connection
 * pair and confirm no exception escapes.
 */
test("fetchGroupDataOverride does not throw when invoked with a stubbed program (no usable banks)", async () => {
  const stubProgram = {
    provider: {
      connection: {
        getProgramAccounts: async () => [],
        getMultipleAccountsInfo: async () => [],
      },
    },
    coder: {
      accounts: {
        decode: () => {
          throw new TypeError("Cannot read properties of null (reading 'property')");
        },
      },
    },
    programId: { toBase58: () => "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacApk" },
  };
  let threw = false;
  try {
    await (fetchGroupDataOverride as (p: unknown, g: unknown) => Promise<unknown>)(
      stubProgram,
      { toBase58: () => "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8" },
    );
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
});
