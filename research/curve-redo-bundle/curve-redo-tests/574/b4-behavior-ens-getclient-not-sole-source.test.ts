import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("resolver consults the multi-RPC api, not just getClient()", async () => {
  let getClientCalls = 0;
  let multiCalls = 0;
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => {
      getClientCalls += 1;
      return { getEnsAddress: async () => REAL };
    },
    getMultiRpcClients: () => {
      multiCalls += 1;
      return [
        { getEnsAddress: async () => REAL },
        { getEnsAddress: async () => REAL },
      ];
    },
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  await fn("vitalik.eth");
  // After fix, the multi-RPC API is used (otherwise the agent has no consensus).
  expect(multiCalls).toBeGreaterThan(0);
});
