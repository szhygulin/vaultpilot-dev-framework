import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILES = [
  "README.md", "SECURITY.md", "DISCLAIMER.md", "LEGAL.md",
  "NOTICE.md", "TERMS.md", "CLAUDE.md", "AGENTS.md",
  "docs/disclaimer.md", "docs/legal.md", "docs/notice.md",
  "server.json", "package.json",
];
const docs = FILES.map((f) => {
  const p = join(root, f);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}).join("\n\n---\n\n");

test("MCP/VaultPilot is explicitly stated to not provide advice", () => {
  expect(docs).toMatch(/(this\s+(mcp|server|software|tool|library|project|protocol)|vaultpilot([\s\-]?mcp)?)[\s\S]{0,120}(is\s+not|does\s+not|shall\s+not)\s+(provide|offer|constitute|render|a\s+(financial|investment|licensed)|give)/i);
});
