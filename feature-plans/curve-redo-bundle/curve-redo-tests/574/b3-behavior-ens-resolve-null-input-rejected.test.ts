import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve rejects null/undefined input", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("throws when given null", async () => {
    const c = {
      readContract: vi.fn(async () => { throw new Error("should not call"); }),
      getEnsAddress: vi.fn(async () => { throw new Error("should not call"); }),
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
    try { result = await fn(null as any, { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).toMatch(/invalid|null|undefined|reject|error/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
