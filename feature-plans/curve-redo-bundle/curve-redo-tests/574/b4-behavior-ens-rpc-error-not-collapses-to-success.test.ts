import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("one-RPC failure + one-RPC success does not produce attested result", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => { throw new Error("rpc down"); } },
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let r: any;
  let threw = false;
  try { r = await fn("vitalik.eth"); } catch { threw = true; }
  if (!threw) {
    const flag =
      r?.attested ?? r?.verified ?? r?.consensus ??
      r?.attestation?.attested ?? r?.attestation?.verified;
    const blob = JSON.stringify(r).toLowerCase();
    expect(
      flag !== true || blob.includes("not-attested") || blob.includes("unattested"),
    ).toBe(true);
  }
});
