import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("reverse resolution with one RPC is marked unattested", async () => {
  const fn = (ens as any).reverseResolveEns ?? (ens as any).reverseResolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const rpcs = [{ url: "r1", lookupAddress: async () => "vitalik.eth" }];
  const out: any = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { rpcs });
  const flat = JSON.stringify(out ?? {}).toLowerCase();
  expect(flat.includes("not-attested") || flat.includes("unattested") || out?.attested === false).toBe(true);
});
