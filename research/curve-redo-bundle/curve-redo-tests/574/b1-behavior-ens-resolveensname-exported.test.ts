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

test("resolveEnsName is exported from an ENS-resolving module", async () => {
  let fn: unknown = undefined;
  for (const path of CANDIDATES) {
    try {
      const spec: string = path;
      const mod: any = await import(spec);
      const candidate = mod?.resolveEnsName ?? mod?.resolve_ens_name ?? mod?.resolveENS ?? mod?.resolveEns;
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
