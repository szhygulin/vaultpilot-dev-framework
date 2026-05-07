import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const FIRST = "0x0000000000000000000000000000000000000111";
const SECOND = "0x0000000000000000000000000000000000000222";

test("on divergence, first RPC's value is not silently chosen", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => FIRST }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => FIRST },
      { getEnsAddress: async () => SECOND },
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
    expect(candidate?.toLowerCase?.()).not.toBe(FIRST.toLowerCase());
  }
});
