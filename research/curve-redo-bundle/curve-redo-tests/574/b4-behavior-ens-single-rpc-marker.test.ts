import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("single-RPC ENS resolution surfaces a not-attested marker", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    // Only one RPC available
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  const result = await fn("vitalik.eth");
  const blob = JSON.stringify(result).toLowerCase();
  expect(blob).toMatch(/not.attested|unattested|single.rpc|data.source.not.attested|warn/);
});
