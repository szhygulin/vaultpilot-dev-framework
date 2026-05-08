import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve refuses with zero configured RPCs", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("throws or returns error when no RPCs are available", async () => {
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => { throw new Error("no rpc available"); },
      resetClients: () => {},
      getAllClients: () => [],
      getClients: () => [],
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
      expect(json).toMatch(/no.*rpc|unavailable|error|refuse|fail/);
    } else {
      expect(threw).toBe(true);
    }
  });
});
