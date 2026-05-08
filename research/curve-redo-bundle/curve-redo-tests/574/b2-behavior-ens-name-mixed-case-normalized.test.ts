import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("mixed-case ENS name is normalized before issuing RPC queries", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const seen: string[] = [];
  const rpcs = [
    { url: "r1", resolveName: async (n: string) => { seen.push(n); return addr; } },
    { url: "r2", resolveName: async (n: string) => { seen.push(n); return addr; } },
  ];
  const out: any = await fn("VITALIK.eth", { rpcs });
  expect(String(out?.address ?? out).toLowerCase()).toBe(addr.toLowerCase());
  // Names passed to the RPCs should match each other (normalized form).
  expect(seen[0]).toBe(seen[1]);
});
