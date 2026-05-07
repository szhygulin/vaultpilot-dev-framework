import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

test("unresolvable name does not return an attested success", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => null }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => null },
      { getEnsAddress: async () => null },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let threw = false;
  let result: any;
  try { result = await fn("definitely-does-not-exist-xyz.eth"); } catch { threw = true; }
  if (!threw) {
    const candidate =
      typeof result === "string" ? result : result?.address ?? result?.resolved;
    expect(candidate ?? null).toBeFalsy();
  }
});
