import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve refuses on divergent RPC results", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses when two RPCs return mismatched addresses for the same name", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const spoof = "0x000000000000000000000000000000000000dEaD";
    let call = 0;
    const mockClient: any = {
      readContract: vi.fn(async () => { call++; return call % 2 === 1 ? honest : spoof; }),
      getEnsAddress: vi.fn(async () => { call++; return call % 2 === 1 ? honest : spoof; }),
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

    if (threw) {
      expect(threw).toBe(true);
    } else {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/diverg|mismatch|refuse|inconsist|conflict|untrusted/);
      // critically: the spoof address must NOT be silently returned as the canonical answer
      const addrField = result?.address ?? result?.resolved ?? result?.value;
      if (typeof addrField === "string") {
        expect(addrField.toLowerCase()).not.toBe(spoof.toLowerCase());
      }
    }
  });
});
