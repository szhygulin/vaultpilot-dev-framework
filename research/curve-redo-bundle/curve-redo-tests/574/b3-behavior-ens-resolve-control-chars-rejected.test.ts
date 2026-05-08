import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve rejects names with control characters", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses 'vitalik\\u0000.eth' (NUL byte injection)", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const c = {
      readContract: vi.fn(async () => honest),
      getEnsAddress: vi.fn(async () => honest),
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
    try { result = await fn("vitalik\u0000.eth", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/invalid|malform|reject|control|illegal/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
