import { test, expect } from "vitest";

const CANDIDATES = [
  "../src/modules/ens/index.js",
  "../src/modules/ens/resolve.js",
  "../src/modules/ens/resolver.js",
  "../src/modules/ens/multi-rpc.js",
  "../src/modules/ens/cross-check.js",
  "../src/contacts/resolver.js",
  "../src/contacts/ens.js",
  "../src/data/ens.js",
];

test("reverseResolveEns is exported from an ENS-resolving module", async () => {
  let fn: unknown = undefined;
  for (const path of CANDIDATES) {
    try {
      const spec: string = path;
      const mod: any = await import(spec);
      const candidate = mod?.reverseResolveEns ?? mod?.reverse_resolve_ens ?? mod?.reverseResolveENS ?? mod?.reverseLookup;
      if (typeof candidate === "function") {
        fn = candidate;
        break;
      }
    } catch {
      /* continue */
    }
  }
  expect(typeof fn).toBe("function");
});
