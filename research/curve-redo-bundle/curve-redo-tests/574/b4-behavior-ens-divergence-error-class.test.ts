import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const A = "0x000000000000000000000000000000000000a1a1";
const B = "0x000000000000000000000000000000000000b2b2";

test("divergence is reported with a recognizable code/tag", async () => {
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
    blob = JSON.stringify(r);
  } catch (e) {
    blob = String((e as Error).message);
  }
  // Recognizable tag/code such as ENS_DIVERGENCE, rpc-divergence, etc.
  expect(blob).toMatch(/divergen|disagree|consensus|mismatch|inconsisten/i);
});
