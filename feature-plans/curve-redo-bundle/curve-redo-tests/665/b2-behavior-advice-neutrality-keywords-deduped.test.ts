import { test, expect } from "vitest";

test("ADVICE_KEYWORDS has no duplicates (case-insensitive)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS.map((k: string) => k.toLowerCase());
  const dedup = new Set(kws);
  expect(dedup.size).toBe(kws.length);
});
