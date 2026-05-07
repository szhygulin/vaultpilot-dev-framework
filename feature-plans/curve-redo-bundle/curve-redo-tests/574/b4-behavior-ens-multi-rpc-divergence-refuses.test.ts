import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const ATTACKER = "0x0000000000000000000000000000000000DEAD01";

test("forward ENS resolution refuses on RPC divergence", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => ATTACKER },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let threw = false;
  let result: any = undefined;
  try {
    result = await fn("vitalik.eth");
  } catch (e) {
    threw = true;
    expect(String((e as Error).message).toLowerCase()).toMatch(
      /diverg|disagree|mismatch|inconsistent|refuse|consensus/,
    );
  }
  if (!threw) {
    // Or, returned-error variant: must NOT silently relay one of the addresses.
    const blob = JSON.stringify(result).toLowerCase();
    expect(blob).toMatch(/diverg|disagree|mismatch|inconsistent|refuse|consensus/);
    // Must not contain the attacker address as the resolved value alone.
    expect(result?.address).not.toBe(ATTACKER);
  }
});
