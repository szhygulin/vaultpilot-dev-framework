import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

test("server.json contains a disclaimer / non-advice marker", () => {
  const raw = fs.readFileSync(path.resolve(__dirname, "../server.json"), "utf8").toLowerCase();
  expect(raw).toMatch(/disclaim|not\s+(?:a\s+source\s+of\s+)?(?:financial|investment)\s+advice|no\s+financial\s+advice/);
});
