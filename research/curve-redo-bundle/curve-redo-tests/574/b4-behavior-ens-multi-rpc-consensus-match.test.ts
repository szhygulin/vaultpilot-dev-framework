import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL_VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("forward ENS resolution returns attested result when 2 RPCs agree", async () => {
  const calls: string[] = [];
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: (chain: string) => {
      calls.push(`getClient:${chain}`);
      return { getEnsAddress: async () => REAL_VITALIK };
    },
    getMultiRpcClients: (chain: string, _opts?: unknown) => {
      calls.push(`multi:${chain}`);
      return [
        { getEnsAddress: async () => REAL_VITALIK },
        { getEnsAddress: async () => REAL_VITALIK },
      ];
    },
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  expect(typeof fn).toBe("function");
  const result = await fn("vitalik.eth");
  // After fix, the response is structured (object) with explicit attestation.
  expect(result === null || typeof result === "object").toBe(true);
  const blob = JSON.stringify(result);
  expect(blob.toLowerCase()).toMatch(/attest|verified|consensus|sources/);
  expect(blob.toLowerCase()).not.toMatch(/data-source-not-attested/);
});
