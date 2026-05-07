import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("reverse ENS rejects checksum-invalid input addresses", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses a 0x... address whose case-mix fails EIP-55", async () => {
    const c: any = {
      readContract: vi.fn(async () => "vitalik.eth"),
      getEnsName: vi.fn(async () => "vitalik.eth"),
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

    // mixed-case but with a deliberately wrong checksum (changed one char's case)
    const badChecksum = "0xD8DA6BF26964Af9D7eEd9e03E53415D37aA96045";
    let threw = false;
    let result: any = null;
    try { result = await fn(badChecksum, { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/invalid|checksum|malform|reject|error/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
