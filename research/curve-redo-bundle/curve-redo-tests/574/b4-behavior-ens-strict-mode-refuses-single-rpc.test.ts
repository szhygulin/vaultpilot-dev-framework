import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("strict mode refuses single-RPC resolution when invoked", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  // Strict opt-in via second arg or env-equivalent flag
  let r: any;
  let threw = false;
  try {
    r = await fn("vitalik.eth", { strict: true, requireConsensus: true });
  } catch (e) {
    threw = true;
    expect(String((e as Error).message).toLowerCase()).toMatch(/attest|consensus|single|insufficient/);
  }
  if (!threw) {
    const blob = JSON.stringify(r).toLowerCase();
    expect(blob).toMatch(/attest|consensus|single|insufficient|not-attested/);
  }
});
