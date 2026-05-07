import { test, expect } from "vitest";

test("verifyDataSource accepts numeric block_height in the attestation triple", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    data_source: { provider: "infura", block_height: 18_000_000, signature: "0xdeadbeef" },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
