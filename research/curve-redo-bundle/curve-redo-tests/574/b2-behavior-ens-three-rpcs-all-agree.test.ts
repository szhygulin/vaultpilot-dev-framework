import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("three RPCs all agreeing yield attested resolution", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = [
    { url: "r1", resolveName: async () => addr },
    { url: "r2", resolveName: async () => addr },
    { url: "r3", resolveName: async () => addr },
  ];

  const out: any = await fn("vitalik.eth", { rpcs });
  expect(String(out?.address ?? out).toLowerCase()).toBe(addr.toLowerCase());
});
