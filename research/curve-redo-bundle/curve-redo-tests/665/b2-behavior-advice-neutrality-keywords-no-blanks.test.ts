import { test, expect } from "vitest";

test("ADVICE_KEYWORDS contains no blank entries", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS;
  for (const k of kws) {
    expect(typeof k).toBe("string");
    expect(k.trim().length).toBeGreaterThan(0);
  }
});
