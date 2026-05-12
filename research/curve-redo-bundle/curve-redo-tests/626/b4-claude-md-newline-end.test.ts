import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md ends with a newline (file-formatting hygiene)", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src.endsWith("\n")).toBe(true);
});
