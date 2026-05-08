import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("variant 16 (regression from #105) does not crash the override either", async () => {
  const fn = (marginfi as Record<string, unknown>).fetchGroupDataOverride as
    | ((...a: unknown[]) => unknown)
    | undefined;
  if (typeof fn !== "function") {
    expect.fail("fetchGroupDataOverride must be exported by the hardened marginfi module");
    return;
  }
  const fakeProgram = {
    coder: {
      accounts: {
        decode: () => {
          throw new Error("Invalid enum variant 16 for oracleSetup");
        },
      },
    },
    provider: {
      connection: { getMultipleAccountsInfo: async () => [] },
    },
  };
  await expect(Promise.resolve(fn(fakeProgram, [], {}))).resolves.not.toThrow;
});
