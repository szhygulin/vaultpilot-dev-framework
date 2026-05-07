import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("reverse single-RPC result includes a boolean attested=false (or equivalent marker)", async () => {
  const fn = (ens as any).reverseResolveEns ?? (ens as any).reverseResolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const rpcs = [{ url: "r1", lookupAddress: async () => "vitalik.eth" }];
  const out: any = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { rpcs });
  const flat = JSON.stringify(out ?? {}).toLowerCase();
  // Must surface SOME observable signal that this isn't attested.
  const hasMarker =
    out?.attested === false ||
    flat.includes("not-attested") ||
    flat.includes("unattested") ||
    flat.includes("single-source") ||
    flat.includes("single_source");
  expect(hasMarker).toBe(true);
});
