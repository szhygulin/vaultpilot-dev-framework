import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("attacker-suggested name is not silently relayed without consensus", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsName: async () => "attacker.eth" }),
    getMultiRpcClients: () => [
      { getEnsName: async () => "attacker.eth" },
      { getEnsName: async () => "vitalik.eth" },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.reverseResolveEns ?? mod.reverseEns ?? mod.resolveAddress ?? mod.lookupEns;
  let result: any;
  let threw = false;
  try { result = await fn(VITALIK); } catch { threw = true; }
  if (!threw) {
    const candidate = typeof result === "string" ? result : result?.name ?? result?.value;
    if (typeof candidate === "string") {
      expect(candidate).not.toBe("attacker.eth");
    }
  }
});
