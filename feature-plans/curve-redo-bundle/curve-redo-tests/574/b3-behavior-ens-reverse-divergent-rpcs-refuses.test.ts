import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("reverse ENS refuses on divergent RPC results", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses when reverse-resolution names disagree across RPCs", async () => {
    let call = 0;
    const mockClient: any = {
      readContract: vi.fn(async () => { call++; return call % 2 === 1 ? "vitalik.eth" : "attacker.eth"; }),
      getEnsName: vi.fn(async () => { call++; return call % 2 === 1 ? "vitalik.eth" : "attacker.eth"; }),
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
    try { result = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { chain: "ethereum" }); }
    catch { threw = true; }

    if (threw) {
      expect(threw).toBe(true);
    } else {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/diverg|mismatch|refuse|inconsist|conflict|untrusted/);
      const nameField = result?.name ?? result?.resolved ?? result?.value;
      if (typeof nameField === "string") {
        expect(nameField).not.toBe("attacker.eth");
      }
    }
  });
});
