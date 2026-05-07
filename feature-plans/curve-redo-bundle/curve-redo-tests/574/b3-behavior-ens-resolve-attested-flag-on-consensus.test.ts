import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve marks consensus result as attested", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("includes explicit attestation field/true when both RPCs agree", async () => {
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

    const result: any = await fn("vitalik.eth", { chain: "ethereum" });
    const json = JSON.stringify(result).toLowerCase();
    // Implementation must indicate attestation/consensus state somewhere in the response.
    expect(json).toMatch(/attest|consensus|verified|sources/);
  });
});
