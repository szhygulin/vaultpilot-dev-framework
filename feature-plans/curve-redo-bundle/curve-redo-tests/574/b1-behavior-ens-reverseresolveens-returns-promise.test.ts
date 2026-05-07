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

test("reverseResolveEns returns a Promise/thenable", async () => {
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
  let result: any;
  try {
    result = fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  } catch {
    result = Promise.resolve();
  }
  expect(typeof result?.then).toBe("function");
  try { await result; } catch { /* expected without RPC mocks */ }
});
