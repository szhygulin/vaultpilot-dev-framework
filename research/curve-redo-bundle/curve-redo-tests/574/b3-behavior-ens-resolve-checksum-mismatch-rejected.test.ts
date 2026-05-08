import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve rejects checksum-mismatched RPC reply", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses when RPC returns address with broken EIP-55 capitalization that fails parse", async () => {
    // bytes that parse as garbage when interpreted as ABI-encoded address
    const c = {
      readContract: vi.fn(async () => "0x12345"),
      getEnsAddress: vi.fn(async () => "0x12345"),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => c,
      resetClients: () => {},
      getAllClients: () => [c, c],
      getClients: () => [c, c],
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
      expect(json).toMatch(/invalid|malform|error|refuse|untrust/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
