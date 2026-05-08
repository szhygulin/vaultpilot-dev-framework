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

test("resolveEnsName accepts at least one argument", async () => {
  let fn: any = undefined;
  for (const path of CANDIDATES) {
    try {
      const spec: string = path;
      const mod: any = await import(spec);
      fn = mod?.resolveEnsName ?? mod?.resolve_ens_name ?? mod?.resolveENS ?? mod?.resolveEns;
      if (typeof fn === "function") break;
    } catch { /* continue */ }
  }
  expect(typeof fn).toBe("function");
  expect((fn as Function).length).toBeGreaterThanOrEqual(1);
});
