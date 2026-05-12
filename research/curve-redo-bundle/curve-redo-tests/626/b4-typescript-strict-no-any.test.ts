import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("actions.ts ack assignment doesn't use `as any` shortcut", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(ackIdx, ackIdx + 200);
  expect(window).not.toMatch(/as\s+any/);
});
