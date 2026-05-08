import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("reverse ENS refuses on null/name divergence", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses when one RPC has a name and the other returns null", async () => {
    let n = 0;
    const c: any = {
      readContract: vi.fn(async () => { n++; return n % 2 === 1 ? "vitalik.eth" : null; }),
      getEnsName: vi.fn(async () => { n++; return n % 2 === 1 ? "vitalik.eth" : null; }),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => c,
      resetClients: () => {},
      getAllClients: () => [c, c],
      getClients: () => [c, c],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.reverseResolveEns ?? mod.reverseResolveEnsName ?? mod.reverseEns ?? mod.default?.reverseResolveEns;
    expect(typeof fn).toBe("function");

    let threw = false;
    let result: any = null;
    try { result = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/diverg|mismatch|refuse|inconsist|conflict|untrusted/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
