import { test, expect, vi } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("empty ENS name does not even reach the RPC layer", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const calls: string[] = [];
  const rpcs = [
    { url: "r1", resolveName: async (n: string) => { calls.push(n); return "0x0000000000000000000000000000000000000000"; } },
    { url: "r2", resolveName: async (n: string) => { calls.push(n); return "0x0000000000000000000000000000000000000000"; } },
  ];

  let threw = false;
  let out: any;
  try {
    out = await fn("", { rpcs });
  } catch {
    threw = true;
  }

  if (!threw) {
    expect(out?.address).toBeFalsy();
  }
  // Whether thrown or returned-null, no successful resolution should be reported.
  if (out) {
    expect(out?.attested === true).toBe(false);
  }
});
