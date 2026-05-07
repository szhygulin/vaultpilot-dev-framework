import { test, expect } from "vitest";

test("ADVISORY_DISCLAIMER references something that signals liability stays with the agent / user, not vaultpilot-mcp", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const d: string = (mod.ADVISORY_DISCLAIMER as string).toLowerCase();
  // accept any reasonable shape of liability-shifting language
  expect(d).toMatch(/(consult|qualified|licensed|own\s+research|do\s+your\s+own|professional|not\s+(a\s+)?(financial|investment|legal)\s+adviser|advisory|informational)/);
});
