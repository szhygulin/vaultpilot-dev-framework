import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("single dissenting attacker RPC among many causes refusal — attacker addr never returned", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const attacker = "0x000000000000000000000000000000000000dEaD";
  const rpcs = [
    ...Array.from({ length: 9 }, (_, i) => ({ url: `r${i}`, resolveName: async () => honest })),
    { url: "attacker", resolveName: async () => attacker },
  ];
  let out: any;
  try {
    out = await fn("vitalik.eth", { rpcs });
  } catch {
    out = null;
  }
  const flat = JSON.stringify(out ?? {}).toLowerCase();
  expect(flat).not.toContain(attacker.toLowerCase());
});
