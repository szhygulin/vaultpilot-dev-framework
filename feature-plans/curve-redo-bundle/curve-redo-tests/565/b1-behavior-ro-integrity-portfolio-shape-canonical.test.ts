import { test, expect } from "vitest";

test("verifyDataSource passes for a get_portfolio_summary-shaped response with attestation", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    totalUsd: "12345.67",
    holdings: [{ symbol: "ETH", balance: "1.5" }],
    data_source: { provider: "alchemy", block_height: 19_500_000, signature: "0xfeedface" },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
