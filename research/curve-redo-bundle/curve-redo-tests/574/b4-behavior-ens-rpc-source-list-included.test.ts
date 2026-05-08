import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("resolver response indicates how many RPCs were consulted", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  const result = await fn("vitalik.eth");
  // Find a numeric source-count or array of sources somewhere in the response.
  const flat = JSON.stringify(result);
  expect(flat).toMatch(/("sources"|"rpcs"|"providers"|"sourceCount"|"rpcCount")/);
});
