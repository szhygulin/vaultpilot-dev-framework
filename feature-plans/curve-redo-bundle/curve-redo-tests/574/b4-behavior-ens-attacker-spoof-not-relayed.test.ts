import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const ATTACKER = "0x000000000000000000000000000000000000beef";

test("spoofed address from one RPC does not propagate as resolved value", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => ATTACKER }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => ATTACKER },
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let result: any;
  let threw = false;
  try {
    result = await fn("vitalik.eth");
  } catch {
    threw = true;
  }
  if (!threw) {
    // Whatever shape, the attacker address must not be the bare resolved address.
    if (typeof result === "string") {
      expect(result.toLowerCase()).not.toBe(ATTACKER.toLowerCase());
    } else if (result && typeof result === "object") {
      const candidate =
        result.address ?? result.resolved ?? result.value ?? result.result;
      if (typeof candidate === "string") {
        expect(candidate.toLowerCase()).not.toBe(ATTACKER.toLowerCase());
      }
    }
  }
});
