import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

// ENS public resolver (canonical, mainnet)
const ENS_PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63".toLowerCase();
const REAL = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("resolver references the canonical ENS public resolver as a safe anchor", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => ({ getEnsAddress: async () => REAL }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => REAL },
      { getEnsAddress: async () => REAL },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const flat = JSON.stringify(mod);
  // Either the module's source-level constants (after fix) reference a canonical
  // resolver address, or the response (when invoked) does.
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  const r: any = await fn("vitalik.eth");
  const responseBlob = JSON.stringify(r).toLowerCase();
  const moduleBlob = flat.toLowerCase();
  const present =
    moduleBlob.includes(ENS_PUBLIC_RESOLVER) ||
    responseBlob.includes(ENS_PUBLIC_RESOLVER) ||
    responseBlob.includes("public-resolver") ||
    responseBlob.includes("publicresolver") ||
    responseBlob.includes("safe-anchor") ||
    responseBlob.includes("anchor");
  expect(present).toBe(true);
});
