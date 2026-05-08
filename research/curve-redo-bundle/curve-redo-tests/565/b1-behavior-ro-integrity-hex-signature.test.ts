import { test, expect } from "vitest";

test("verifyDataSource accepts a 0x-prefixed hex signature", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const sig = "0x" + "cafe".repeat(16);
  const r = mod.verifyDataSource({
    data_source: { provider: "alchemy", block_height: 19_000_000, signature: sig },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
