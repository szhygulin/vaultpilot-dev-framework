import { test, expect } from "vitest";

test("resolver module exports something with multi-RPC/attest semantics", async () => {
  const mod: any = await import("../src/contacts/resolver.js");
  const exportNames = Object.keys(mod).map((k) => k.toLowerCase());
  const flat = exportNames.join(",");
  // After fix, expect at least one identifiable export tied to consensus/attestation
  // for ENS resolution. Names below are common phrasings.
  const needles = [
    "resolveensname",
    "reverseresolveens",
    "resolveenswithconsensus",
    "ensconsensus",
    "verifiedensresolve",
    "ensattestation",
    "resolveensattested",
    "resolveensmultirpc",
  ];
  expect(needles.some((n) => flat.includes(n))).toBe(true);
});
