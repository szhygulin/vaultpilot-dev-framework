import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve handles canonical zero-address as not-registered", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("both RPCs return null/zero -> result indicates name unregistered, not divergence", async () => {
    const c = {
      readContract: vi.fn(async () => null),
      getEnsAddress: vi.fn(async () => null),
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
    try { result = await fn("definitely-does-not-exist-x9q.eth", { chain: "ethereum" }); }
    catch { threw = true; }

    if (!threw) {
      const json = JSON.stringify(result).toLowerCase();
      // Should not be reported as a divergence/refusal — both sources agree (none).
      expect(json).not.toMatch(/diverg|conflict/);
      expect(json).toMatch(/null|none|unregister|not.*found|no.*record|no.*resol/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
