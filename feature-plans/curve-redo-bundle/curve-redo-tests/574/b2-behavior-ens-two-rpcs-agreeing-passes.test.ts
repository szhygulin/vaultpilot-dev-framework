import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("two RPCs agreeing on the same address yields an attested result", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = [
    { url: "https://a.example", resolveName: async () => addr },
    { url: "https://b.example", resolveName: async () => addr },
  ];

  const out: any = await fn("vitalik.eth", { rpcs });
  expect(String(out?.address ?? out).toLowerCase()).toBe(addr.toLowerCase());
  // Must NOT be flagged unattested when 2+ sources agree.
  const serialized = JSON.stringify(out ?? {}).toLowerCase();
  expect(serialized.includes("not-attested") || serialized.includes("unattested")).toBe(false);
});
