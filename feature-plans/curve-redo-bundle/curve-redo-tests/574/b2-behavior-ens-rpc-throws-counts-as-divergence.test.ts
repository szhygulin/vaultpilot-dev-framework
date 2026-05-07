import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("throwing RPC plus one address-returning RPC is not an attested 1-of-1 result", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = [
    { url: "broken", resolveName: async () => { throw new Error("network"); } },
    { url: "only-other", resolveName: async () => addr },
  ];
  let out: any;
  try {
    out = await fn("vitalik.eth", { rpcs });
  } catch {
    out = null;
  }
  if (out && typeof out === "object") {
    // Either no address, or explicit unattested.
    expect(out.attested === true).toBe(false);
  }
});
