import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve rejects names without a dot", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses 'vitalik' (no TLD) as malformed input", async () => {
    const mockClient: any = {
      readContract: vi.fn(async () => "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
      getEnsAddress: vi.fn(async () => "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => mockClient,
      resetClients: () => {},
      getAllClients: () => [mockClient, mockClient],
      getClients: () => [mockClient, mockClient],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName ?? mod.default?.resolveEnsName;
    expect(typeof fn).toBe("function");

    let threw = false;
    let result: any = null;
    try { result = await fn("vitalik", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/invalid|malform|not.*ens|reject/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
