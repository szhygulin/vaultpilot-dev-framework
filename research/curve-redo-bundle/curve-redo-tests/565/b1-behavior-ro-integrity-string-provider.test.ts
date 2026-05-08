import { test, expect } from "vitest";

test("verifyDataSource accepts a string provider naming the RPC source", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    data_source: { provider: "infura-mainnet-eth", block_height: 19_000_000, signature: "0xfeed" },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
