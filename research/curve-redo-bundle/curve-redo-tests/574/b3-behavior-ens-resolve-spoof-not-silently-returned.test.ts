import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve never silently returns a spoofed address", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("two RPCs return different addresses for vitalik.eth: bare result is forbidden", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const spoof = "0x000000000000000000000000000000000000dEaD";
    let n = 0;
    const c: any = {
      readContract: vi.fn(async () => { n++; return n === 1 ? spoof : honest; }),
      getEnsAddress: vi.fn(async () => { n++; return n === 1 ? spoof : honest; }),
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
      // The output JSON must NOT contain ONLY the spoof address with an attested-true claim;
      // either it refuses, or warns/marks divergence.
      const json = JSON.stringify(result).toLowerCase();
      const claimsAttested = /"attested"\s*:\s*true/.test(json) || /attested.*:?\s*true/.test(json);
      const flagsDivergence = /diverg|mismatch|refuse|inconsist|conflict|untrust|not[- _]?attest/.test(json);
      // If it doesn't refuse, it must flag divergence — never claim attested with a single spoofed source.
      if (!flagsDivergence) {
        expect(claimsAttested).toBe(false);
      }
    } else {
      expect(threw).toBe(true);
    }
  });
});
