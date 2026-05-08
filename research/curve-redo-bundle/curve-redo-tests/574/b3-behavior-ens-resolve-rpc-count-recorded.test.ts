import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ENS resolve records RPC audit trail", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("queries at least 2 RPCs when multiple are available", async () => {
    const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const a = {
      readContract: vi.fn(async () => honest),
      getEnsAddress: vi.fn(async () => honest),
    };
    const b = {
      readContract: vi.fn(async () => honest),
      getEnsAddress: vi.fn(async () => honest),
    };
    vi.doMock("../src/data/rpc.js", () => ({
      getClient: () => a,
      resetClients: () => {},
      getAllClients: () => [a, b],
      getClients: () => [a, b],
    }));

    const mod: any = await import("../src/contacts/resolver.js");
    const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName ?? mod.default?.resolveEnsName;
    expect(typeof fn).toBe("function");

    await fn("vitalik.eth", { chain: "ethereum" });

    const totalA = (a.readContract.mock.calls.length + a.getEnsAddress.mock.calls.length);
    const totalB = (b.readContract.mock.calls.length + b.getEnsAddress.mock.calls.length);
    // Both clients must have been consulted at least once.
    expect(totalA).toBeGreaterThanOrEqual(1);
    expect(totalB).toBeGreaterThanOrEqual(1);
  });
});
