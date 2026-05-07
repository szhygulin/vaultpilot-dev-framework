import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("reverse resolution divergence does not surface either name as attested", async () => {
  const fn = (ens as any).reverseResolveEns ?? (ens as any).reverseResolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const rpcs = [
    { url: "r1", lookupAddress: async () => "vitalik.eth" },
    { url: "r2", lookupAddress: async () => "attacker.eth" },
  ];
  let out: any;
  let threw = false;
  try {
    out = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { rpcs });
  } catch {
    threw = true;
  }
  if (!threw) {
    expect(out?.attested === true).toBe(false);
  }
});
