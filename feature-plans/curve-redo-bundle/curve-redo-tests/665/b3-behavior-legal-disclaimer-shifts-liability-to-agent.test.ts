import { test, expect } from "vitest";

test("disclaimer text places liability on the agent / operator, not vaultpilot-mcp", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const text: string =
    mod.NOT_FINANCIAL_ADVICE ?? mod.LEGAL_DISCLAIMER ?? mod.DISCLAIMER ?? mod.default;
  const lower = text.toLowerCase();
  expect(lower).toMatch(/agent|operator|user/);
  expect(lower).toMatch(/liabilit|responsib/);
});
