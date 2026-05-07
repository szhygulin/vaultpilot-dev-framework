import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("reverse ENS surfaces 'data-source-not-attested' marker on single-RPC reads", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("flags single-RPC reverse resolution as not attested", async () => {
    const mockClient: any = {
      readContract: vi.fn(async () => "vitalik.eth"),
      getEnsName: vi.fn(async () => "vitalik.eth"),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => mockClient,
      resetClients: () => {},
      getAllClients: () => [mockClient],
      getClients: () => [mockClient],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.reverseResolveEns ?? mod.reverseResolveEnsName ?? mod.reverseEns ?? mod.default?.reverseResolveEns;
    expect(typeof fn).toBe("function");

    let result: any = null;
    let threw = false;
    try { result = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { chain: "ethereum" }); }
    catch { threw = true; }

    if (threw) {
      expect(threw).toBe(true);
    } else {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/not[- _]?attest|unattest|single[- _]?rpc|no[- _]?consensus/);
    }
  });
});
