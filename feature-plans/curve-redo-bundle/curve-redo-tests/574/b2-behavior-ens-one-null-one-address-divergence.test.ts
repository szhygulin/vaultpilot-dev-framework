import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("null vs address across two RPCs is divergence — refuse", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = [
    { url: "r1", resolveName: async () => null },
    { url: "r2", resolveName: async () => addr },
  ];

  let out: any;
  let threw = false;
  try {
    out = await fn("vitalik.eth", { rpcs });
  } catch {
    threw = true;
  }

  if (!threw) {
    const flat = JSON.stringify(out ?? {}).toLowerCase();
    // Must not silently accept the address from one RPC.
    if (out?.address) {
      expect(out?.attested === true).toBe(false);
    }
    // Either unattested or no address.
    expect(out?.attested === true && String(out?.address).toLowerCase() === addr.toLowerCase()).toBe(false);
    void flat;
  }
});
