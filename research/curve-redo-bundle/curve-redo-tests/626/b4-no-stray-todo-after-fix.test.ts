import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("no obviously stale TODO/FIXME near ack site", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, ackIdx - 600), ackIdx + 200);
  expect(window).not.toMatch(/TODO\s*:.*acknowledge|FIXME.*ack/i);
});
