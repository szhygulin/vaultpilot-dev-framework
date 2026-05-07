import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("reverse ENS rejects malformed address input", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("throws or returns error on a non-0x string", async () => {
    const mockClient: any = {
      readContract: vi.fn(async () => "vitalik.eth"),
      getEnsName: vi.fn(async () => "vitalik.eth"),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => mockClient,
      resetClients: () => {},
      getAllClients: () => [mockClient, mockClient],
      getClients: () => [mockClient, mockClient],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.reverseResolveEns ?? mod.reverseResolveEnsName ?? mod.reverseEns ?? mod.default?.reverseResolveEns;
    expect(typeof fn).toBe("function");

    let threw = false;
    let result: any = null;
    try { result = await fn("not-an-address", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/invalid|malform|reject|not.*address/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
