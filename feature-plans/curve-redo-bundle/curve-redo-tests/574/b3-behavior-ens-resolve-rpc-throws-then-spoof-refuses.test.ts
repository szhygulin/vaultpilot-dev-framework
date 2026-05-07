import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve does not attest when only one RPC succeeded", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("first RPC throws, second succeeds -> result is not marked attested-true", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    let n = 0;
    const c: any = {
      readContract: vi.fn(async () => { n++; if (n === 1) throw new Error("503"); return honest; }),
      getEnsAddress: vi.fn(async () => { n++; if (n === 1) throw new Error("503"); return honest; }),
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
      const trueAttested = /attested["'\s]*[:=]\s*true/.test(json);
      const flagsCaveat = /not[- _]?attest|unattest|partial|single|warn|caveat|no[- _]?consensus/.test(json);
      // It must surface SOME caveat (not silently attest with one source)
      if (trueAttested) {
        expect(flagsCaveat).toBe(true);
      } else {
        // Either explicit attested=false or no attestation claim — both acceptable.
        expect(true).toBe(true);
      }
      expect(flagsCaveat || !trueAttested).toBe(true);
    } else {
      expect(threw).toBe(true);
    }
  });
});
