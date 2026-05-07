import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const A = "0x000000000000000000000000000000000000aaaa";
const B = "0x000000000000000000000000000000000000bbbb";

test("divergence surfaces both conflicting candidate addresses", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => A }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => A },
      { getEnsAddress: async () => B },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let blob = "";
  try {
    const r = await fn("vitalik.eth");
    blob = JSON.stringify(r).toLowerCase();
  } catch (e) {
    blob = String((e as Error).message).toLowerCase();
  }
  expect(blob).toContain(A.toLowerCase());
  expect(blob).toContain(B.toLowerCase());
});
