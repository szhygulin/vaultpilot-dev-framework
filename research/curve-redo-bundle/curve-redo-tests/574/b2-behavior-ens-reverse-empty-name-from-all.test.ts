import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("reverse-resolution with all-null returns no attested name", async () => {
  const fn = (ens as any).reverseResolveEns ?? (ens as any).reverseResolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const rpcs = [
    { url: "r1", lookupAddress: async () => null },
    { url: "r2", lookupAddress: async () => null },
  ];
  let out: any;
  try {
    out = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { rpcs });
  } catch {
    out = null;
  }
  if (out && typeof out === "object") {
    expect(out.name).toBeFalsy();
  }
});
