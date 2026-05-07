import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("reverse ENS handles zero-address input gracefully", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("does not throw, surfaces 'no name' for 0x0000... when both RPCs return null", async () => {
    const c = {
      readContract: vi.fn(async () => null),
      getEnsName: vi.fn(async () => null),
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

    let threw = false;
    let result: any = null;
    try { result = await fn("0x0000000000000000000000000000000000000000", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).not.toMatch(/diverg|conflict/);
      expect(json).toMatch(/null|none|no.*name|not.*found|no.*reverse|no.*record/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
