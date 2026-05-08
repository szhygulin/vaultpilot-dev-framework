import { test, expect } from "vitest";

test("ADVISORY_DISCLAIMER text signals non-advisory / informational nature", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const d: string = mod.ADVISORY_DISCLAIMER;
  // accept any of the obvious phrasings
  expect(d.toLowerCase()).toMatch(/(not\s+(financial|investment|legal)\s+advice|informational\s+only|no\s+(financial|investment)\s+advice|advisory)/);
});
