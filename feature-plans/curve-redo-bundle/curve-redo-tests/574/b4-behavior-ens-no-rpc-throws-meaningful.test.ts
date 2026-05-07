import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

test("resolution with no RPCs fails closed (does not return success)", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    getClient: () => { throw new Error("no rpc configured"); },
    getMultiRpcClients: () => [],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let threw = false;
  let result: any;
  try { result = await fn("vitalik.eth"); } catch { threw = true; }
  if (!threw) {
    // Must not return success-shaped output with an address.
    const flat = JSON.stringify(result).toLowerCase();
    expect(flat).toMatch(/error|unavailable|no.rpc|cannot|fail|refuse|not.attested/);
  }
});
