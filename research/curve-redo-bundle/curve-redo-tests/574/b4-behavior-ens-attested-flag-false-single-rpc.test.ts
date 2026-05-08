import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("attestation flag is false (or marker present) when only one RPC contributed", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  const result: any = await fn("vitalik.eth");
  const flag =
    result?.attested ?? result?.verified ?? result?.consensus ??
    result?.attestation?.attested ?? result?.attestation?.verified;
  const blob = JSON.stringify(result).toLowerCase();
  // Either the boolean is explicitly falsey OR the warning marker is present.
  expect(
    flag === false ||
      flag === "false" ||
      blob.includes("not-attested") ||
      blob.includes("unattested") ||
      blob.includes("data-source-not-attested"),
  ).toBe(true);
});
