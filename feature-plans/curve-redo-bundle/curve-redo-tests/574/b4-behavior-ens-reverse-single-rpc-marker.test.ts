import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("reverse ENS resolution marks single-RPC outcomes as not-attested", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsName: async () => "vitalik.eth" }),
    getMultiRpcClients: () => [{ getEnsName: async () => "vitalik.eth" }],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.reverseResolveEns ?? mod.reverseEns ?? mod.resolveAddress ?? mod.lookupEns;
  const result: any = await fn(VITALIK);
  const blob = JSON.stringify(result).toLowerCase();
  expect(blob).toMatch(/not.attested|unattested|single.rpc|warn/);
});
