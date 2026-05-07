import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("forward ENS response is a structured object with attestation field", async () => {
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
  const result = await fn("vitalik.eth");
  expect(result).not.toBeNull();
  expect(typeof result).toBe("object");
  const keys = Object.keys(result).map((k) => k.toLowerCase());
  const hasAttestation = keys.some((k) =>
    /attest|verified|consensus|sources|rpcs|providers|attested/.test(k),
  );
  expect(hasAttestation).toBe(true);
});
