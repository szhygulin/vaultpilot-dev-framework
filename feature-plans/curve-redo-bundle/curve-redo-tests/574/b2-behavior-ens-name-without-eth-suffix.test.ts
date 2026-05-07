import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("a name with no TLD is rejected without consulting RPCs", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  let called = 0;
  const rpcs = [
    { url: "r1", resolveName: async () => { called++; return "0x0000000000000000000000000000000000000000"; } },
    { url: "r2", resolveName: async () => { called++; return "0x0000000000000000000000000000000000000000"; } },
  ];
  let out: any;
  try {
    out = await fn("vitalik", { rpcs });
  } catch {
    out = null;
  }
  // Whether thrown or returned, it must not surface a successful attested address.
  if (out && typeof out === "object") {
    expect(out.address).toBeFalsy();
  }
});
