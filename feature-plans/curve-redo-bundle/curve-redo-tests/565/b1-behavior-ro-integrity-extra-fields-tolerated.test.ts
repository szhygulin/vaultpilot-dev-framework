import { test, expect } from "vitest";

test("verifyDataSource tolerates extra metadata fields beyond {provider, block_height, signature}", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    data: { foo: "bar" },
    data_source: {
      provider: "alchemy",
      block_height: 19_000_000,
      signature: "0xabc",
      timestamp: 1714000000,
      cluster: "mainnet",
    },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
