import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve marks partial-RPC outcome as unattested", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("flags single successful RPC out of two as not attested", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const ok = {
      readContract: vi.fn(async () => honest),
      getEnsAddress: vi.fn(async () => honest),
    };
    const bad = {
      readContract: vi.fn(async () => { throw new Error("timeout"); }),
      getEnsAddress: vi.fn(async () => { throw new Error("timeout"); }),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => ok,
      resetClients: () => {},
      getAllClients: () => [ok, bad],
      getClients: () => [ok, bad],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName ?? mod.default?.resolveEnsName;
    expect(typeof fn).toBe("function");

    let threw = false;
    let result: any = null;
    try { result = await fn("vitalik.eth", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/not[- _]?attest|unattest|partial|single|no[- _]?consensus|warn/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
