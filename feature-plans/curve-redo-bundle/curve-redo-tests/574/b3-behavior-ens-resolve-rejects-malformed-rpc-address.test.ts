import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve rejects malformed RPC reply", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("surfaces error if both RPCs return non-address junk", async () => {
    const mockClient: any = {
      readContract: vi.fn(async () => "0xNOTANADDRESS"),
      getEnsAddress: vi.fn(async () => "0xNOTANADDRESS"),
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
    try { result = await fn("vitalik.eth", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/invalid|malform|error|untrusted|refuse/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
