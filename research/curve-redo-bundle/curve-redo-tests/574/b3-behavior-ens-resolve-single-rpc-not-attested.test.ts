import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve surfaces 'data-source-not-attested' marker on single-RPC reads", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("flags single-RPC resolution result as not attested", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const mockClient: any = {
      readContract: vi.fn(async () => honest),
      getEnsAddress: vi.fn(async () => honest),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => mockClient,
      resetClients: () => {},
      getAllClients: () => [mockClient], // only ONE rpc available
      getClients: () => [mockClient],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName ?? mod.default?.resolveEnsName;
    expect(typeof fn).toBe("function");

    let result: any = null;
    let threw = false;
    try { result = await fn("vitalik.eth", { chain: "ethereum" }); }
    catch { threw = true; }

    // Either the call refuses outright OR returns a clearly-marked not-attested result.
    if (threw) {
      expect(threw).toBe(true);
    } else {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/not[- _]?attest|unattest|single[- _]?rpc|no[- _]?consensus|data[- _]?source[- _]?not[- _]?attest/);
    }
  });
});
