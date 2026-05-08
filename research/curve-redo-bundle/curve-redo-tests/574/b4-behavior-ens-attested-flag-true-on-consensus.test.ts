import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("response includes a boolean attestation flag set to true on consensus", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  const result: any = await fn("vitalik.eth");
  const candidates = [
    result?.attested,
    result?.verified,
    result?.consensus,
    result?.attestation?.attested,
    result?.attestation?.verified,
  ];
  expect(candidates.some((v) => v === true)).toBe(true);
});
