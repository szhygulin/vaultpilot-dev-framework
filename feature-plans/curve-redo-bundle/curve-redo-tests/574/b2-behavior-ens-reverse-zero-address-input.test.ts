import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("reverse-resolving the zero address is rejected", async () => {
  const fn = (ens as any).reverseResolveEns ?? (ens as any).reverseResolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const rpcs = [
    { url: "r1", lookupAddress: async () => "anything.eth" },
    { url: "r2", lookupAddress: async () => "anything.eth" },
  ];
  let threw = false;
  let out: any;
  try {
    out = await fn("0x0000000000000000000000000000000000000000", { rpcs });
  } catch {
    threw = true;
  }
  if (!threw) {
    expect(out?.name).toBeFalsy();
  }
});
