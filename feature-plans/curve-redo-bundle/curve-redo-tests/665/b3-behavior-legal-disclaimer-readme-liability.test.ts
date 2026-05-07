import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

test("README disclaims liability for advice produced by the agent", () => {
  const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8").toLowerCase();
  // Must mention liability OR responsibility on the agent / user side, not the MCP.
  expect(readme).toMatch(/liabilit|responsib/);
  expect(readme).toMatch(/agent|user|operator/);
});
