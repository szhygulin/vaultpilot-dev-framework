import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("single RPC produces an unattested marker on the result", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const fakeRpc = {
    url: "https://rpc-1.example/",
    resolveName: async () => "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  };

  const out: any = await fn("vitalik.eth", { rpcs: [fakeRpc] });
  const serialized = JSON.stringify(out ?? {}).toLowerCase();
  expect(serialized.includes("not-attested") || serialized.includes("unattested") || out?.attested === false).toBe(true);
});
