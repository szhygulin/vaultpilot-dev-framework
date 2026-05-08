import { test, expect } from "vitest";

test("verifyDataSource passes for a get_market_incident_status-shaped response with attestation", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    incident: null,
    btcPriceUsd: "67000",
    data_source: { provider: "chainlink-eth-mainnet", block_height: 19_500_000, signature: "0x1234" },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
