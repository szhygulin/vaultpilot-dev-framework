import { test, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

const ATTACKER = "0x000000000000000000000000000000000000dead";

test("end-to-end: spoofed vitalik.eth -> attacker is never returned attested", async () => {
  vi.doMock("../src/data/rpc.js", () => ({
    // Simulate a compromised single-RPC environment returning the attacker's address.
    getClient: () => ({ getEnsAddress: async () => ATTACKER }),
    getMultiRpcClients: () => [
      { getEnsAddress: async () => ATTACKER },
    ],
    resetClients: () => {},
  }));
  const mod: any = await import("../src/contacts/resolver.js");
  const fn = mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName;
  let r: any;
  let threw = false;
  try { r = await fn("vitalik.eth"); } catch { threw = true; }
  if (!threw) {
    // If a value is returned at all, it MUST carry a not-attested marker —
    // never a clean attested mapping pointing at the attacker.
    const flag =
      r?.attested ?? r?.verified ?? r?.consensus ??
      r?.attestation?.attested ?? r?.attestation?.verified;
    const candidate =
      typeof r === "string" ? r : r?.address ?? r?.resolved ?? r?.value;
    const blob = JSON.stringify(r).toLowerCase();
    const cleanAttested = flag === true && !blob.includes("not-attested") && !blob.includes("unattested");
    if (typeof candidate === "string" && candidate.toLowerCase() === ATTACKER.toLowerCase()) {
      expect(cleanAttested).toBe(false);
    }
  }
});
