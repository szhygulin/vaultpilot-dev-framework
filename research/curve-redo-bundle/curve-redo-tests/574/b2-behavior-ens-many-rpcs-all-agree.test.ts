import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("ten RPCs all in agreement yield an attested result", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = Array.from({ length: 10 }, (_, i) => ({
    url: `r${i}`,
    resolveName: async () => addr,
  }));
  const out: any = await fn("vitalik.eth", { rpcs });
  expect(String(out?.address ?? out).toLowerCase()).toBe(addr.toLowerCase());
  const flat = JSON.stringify(out ?? {}).toLowerCase();
  expect(flat.includes("not-attested")).toBe(false);
});
