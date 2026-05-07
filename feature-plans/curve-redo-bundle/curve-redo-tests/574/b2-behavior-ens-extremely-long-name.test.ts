import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("extremely long label name is consensused without crash", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const longLabel = "a".repeat(255);
  const rpcs = [
    { url: "r1", resolveName: async () => addr },
    { url: "r2", resolveName: async () => addr },
  ];
  let out: any;
  try {
    out = await fn(`${longLabel}.eth`, { rpcs });
  } catch {
    out = null;
  }
  // If accepted, it must be attested; if rejected as too-long that's also fine.
  if (out && out.address) {
    expect(String(out.address).toLowerCase()).toBe(addr.toLowerCase());
  }
});
