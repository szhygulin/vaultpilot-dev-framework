import { test, expect } from "vitest";

test("containsPersonalAdvice returns false when input contains zero advice keywords (off-by-one count)", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS.map((k: string) => k.toLowerCase());
  // build a sentence that intentionally avoids every keyword
  const safe = "price quote retrieved from public api at timestamp t";
  const lower = safe.toLowerCase();
  for (const kw of kws) {
    // assumption: the sample sentence avoids every keyword. If a keyword sneaks in, fail loudly.
    expect(lower.includes(kw), `test sentence accidentally contains keyword '${kw}'`).toBe(false);
  }
  expect(mod.containsPersonalAdvice(safe)).toBe(false);
});
