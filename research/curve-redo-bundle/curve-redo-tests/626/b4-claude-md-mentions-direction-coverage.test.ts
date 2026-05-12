import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md rule mentions both direction shapes (eth_to_steth / steth_to_eth) or 'both directions'", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/eth_to_steth|steth_to_eth|both directions|every prepare_/i);
});
