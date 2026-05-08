import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve refuses when every RPC fails", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("throws or surfaces error when all RPCs error out", async () => {
    const broken = {
      readContract: vi.fn(async () => { throw new Error("ECONNRESET"); }),
      getEnsAddress: vi.fn(async () => { throw new Error("ECONNRESET"); }),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => broken,
      resetClients: () => {},
      getAllClients: () => [broken, broken],
      getClients: () => [broken, broken],
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
      expect(json).toMatch(/error|fail|unavailable|refuse|no.*data/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
