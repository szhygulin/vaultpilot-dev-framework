import { test, expect } from "vitest";

test("verifyDataSource accepts large block heights typical of mainnet", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const r = mod.verifyDataSource({
    data_source: { provider: "quicknode", block_height: 99_999_999, signature: "0x" + "1".repeat(130) },
  });
  const ok = r === true || (r && typeof r === "object" && r.ok === true);
  expect(ok).toBe(true);
});
