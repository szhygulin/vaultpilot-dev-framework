import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("duplicate RPC URLs do not count as independent attestations", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = [
    { url: "https://same.example", resolveName: async () => addr },
    { url: "https://same.example", resolveName: async () => addr },
  ];
  const out: any = await fn("vitalik.eth", { rpcs });
  // Treated as a single source — should be unattested.
  const flat = JSON.stringify(out ?? {}).toLowerCase();
  expect(flat.includes("not-attested") || flat.includes("unattested") || out?.attested === false).toBe(true);
});
