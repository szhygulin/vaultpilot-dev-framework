import { test, expect } from "vitest";

test("each ADVICE_KEYWORDS entry is detected by containsPersonalAdvice in isolation", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const kws: string[] = mod.ADVICE_KEYWORDS;
  for (const kw of kws) {
    expect(mod.containsPersonalAdvice(kw), `keyword '${kw}' should be detected`).toBe(true);
  }
});
