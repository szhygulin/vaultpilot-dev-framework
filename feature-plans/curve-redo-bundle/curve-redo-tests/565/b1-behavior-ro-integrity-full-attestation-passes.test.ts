import { test, expect } from "vitest";

test("verifyDataSource returns ok for response carrying full {provider, block_height, signature}", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    data_source: {
      provider: "alchemy-mainnet",
      block_height: 19_000_000,
      signature: "0x" + "ab".repeat(32),
    },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
