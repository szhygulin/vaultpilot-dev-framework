import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("2-of-3 split is not silently accepted as consensus carrying the attacker minority", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const attacker = "0x000000000000000000000000000000000000dEaD";
  const rpcs = [
    { url: "r1", resolveName: async () => honest },
    { url: "r2", resolveName: async () => honest },
    { url: "r3", resolveName: async () => attacker },
  ];

  let out: any;
  try {
    out = await fn("vitalik.eth", { rpcs });
  } catch {
    out = null;
  }
  const flat = JSON.stringify(out ?? {}).toLowerCase();
  // Critical: attacker address must never leak into the response.
  expect(flat).not.toContain(attacker.toLowerCase());
});
