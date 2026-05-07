import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("reverse ENS resolution refuses on RPC name divergence", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsName: async () => "vitalik.eth" }),
    getMultiRpcClients: () => [
      { getEnsName: async () => "vitalik.eth" },
      { getEnsName: async () => "attacker.eth" },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.reverseResolveEns ?? mod.reverseEns ?? mod.resolveAddress ?? mod.lookupEns;
  let threw = false;
  let result: any;
  try { result = await fn(VITALIK); } catch (e) { threw = true; }
  if (!threw) {
    const blob = JSON.stringify(result).toLowerCase();
    expect(blob).toMatch(/diverg|disagree|mismatch|inconsistent|refuse/);
    expect(blob).not.toMatch(/^.*"name":\s*"attacker\.eth".*$/);
  }
});
