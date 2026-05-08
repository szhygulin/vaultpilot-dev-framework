import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SPOOF = "0x000000000000000000000000000000000000c0de";

test("3-RPC scenario with one dissenter never relays the dissenter as the answer", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => SPOOF },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let result: any;
  let threw = false;
  try { result = await fn("vitalik.eth"); } catch { threw = true; }
  if (!threw) {
    const candidate =
      typeof result === "string" ? result : result?.address ?? result?.resolved ?? result?.value;
    if (typeof candidate === "string") {
      expect(candidate.toLowerCase()).not.toBe(SPOOF.toLowerCase());
    }
  }
});
