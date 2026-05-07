import { test, expect } from "vitest";

const CANDIDATES = [
  "../src/modules/ens/index.js",
  "../src/modules/ens/resolve.js",
  "../src/modules/ens/resolver.js",
  "../src/modules/ens/multi-rpc.js",
  "../src/contacts/resolver.js",
  "../src/contacts/ens.js",
  "../src/data/ens.js",
];

test("reverseResolveEns accepts at least one argument", async () => {
  let fn: any = undefined;
  for (const path of CANDIDATES) {
    try {
      const spec: string = path;
      const mod: any = await import(spec);
      fn = mod?.reverseResolveEns ?? mod?.reverse_resolve_ens ?? mod?.reverseResolveENS ?? mod?.reverseLookup;
      if (typeof fn === "function") break;
    } catch { /* continue */ }
  }
  expect(typeof fn).toBe("function");
  expect((fn as Function).length).toBeGreaterThanOrEqual(1);
});
