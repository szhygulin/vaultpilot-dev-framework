import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("forward ENS resolution issues >=2 underlying RPC queries", async () => {
  let calls = 0;
  const client = { getEnsAddress: async () => { calls += 1; return REAL; } };
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => client,
    getMultiRpcClients: () => [
      { getEnsAddress: async () => { calls += 1; return REAL; } },
      { getEnsAddress: async () => { calls += 1; return REAL; } },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  await fn("vitalik.eth");
  expect(calls).toBeGreaterThanOrEqual(2);
});
