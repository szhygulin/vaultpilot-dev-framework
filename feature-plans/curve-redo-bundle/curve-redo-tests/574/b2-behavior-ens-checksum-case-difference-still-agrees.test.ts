import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("case differences in returned address don't break consensus", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const checksum = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const lowered = checksum.toLowerCase();
  const rpcs = [
    { url: "r1", resolveName: async () => checksum },
    { url: "r2", resolveName: async () => lowered },
  ];

  const out: any = await fn("vitalik.eth", { rpcs });
  expect(String(out?.address ?? out).toLowerCase()).toBe(lowered);
});
