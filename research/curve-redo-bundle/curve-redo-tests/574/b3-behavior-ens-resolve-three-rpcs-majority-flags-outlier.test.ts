import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve flags outlier among 3 RPCs", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("reports divergence/refusal even when 2 of 3 RPCs agree", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const spoof = "0x000000000000000000000000000000000000dEaD";
    let n = 0;
    const c: any = {
      readContract: vi.fn(async () => { n++; return n === 3 ? spoof : honest; }),
      getEnsAddress: vi.fn(async () => { n++; return n === 3 ? spoof : honest; }),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => c,
      resetClients: () => {},
      getAllClients: () => [c, c, c],
      getClients: () => [c, c, c],
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
      expect(json).toMatch(/diverg|mismatch|refuse|inconsist|conflict|untrust|warn/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
