import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("surrounding whitespace in the ENS name is trimmed prior to consensus", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const seen: string[] = [];
  const rpcs = [
    { url: "r1", resolveName: async (n: string) => { seen.push(n); return addr; } },
    { url: "r2", resolveName: async (n: string) => { seen.push(n); return addr; } },
  ];
  const out: any = await fn("  vitalik.eth  ", { rpcs });
  expect(String(out?.address ?? out).toLowerCase()).toBe(addr.toLowerCase());
  // Each RPC must see the same trimmed string.
  expect(seen[0]).toBe(seen[1]);
  expect(seen[0]).not.toMatch(/^\s|\s$/);
});
