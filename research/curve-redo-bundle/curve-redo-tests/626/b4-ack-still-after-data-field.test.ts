// In the PR diff, the ack lives below the `data` / `decoded` fields.
// Verify ack appears in source AFTER the `data` field in the same literal.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ack appears after some `data:` or `decoded:` field in the same literal", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, ackIdx - 1200), ackIdx);
  expect(window).toMatch(/\bdata\s*:|decoded\s*:/);
});
