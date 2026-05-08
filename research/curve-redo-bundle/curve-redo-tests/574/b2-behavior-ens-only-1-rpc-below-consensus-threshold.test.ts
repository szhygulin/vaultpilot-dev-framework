import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("single-RPC count is below consensus threshold; result is not attested", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const rpcs = [{ url: "only", resolveName: async () => addr }];
  const out: any = await fn("vitalik.eth", { rpcs });
  expect(out?.attested === true).toBe(false);
});
