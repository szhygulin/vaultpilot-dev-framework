// ProtocolJob discriminator.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 protocol job discriminator", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/ProtocolJob|{ kind:\s*["']rows["']/);
});
