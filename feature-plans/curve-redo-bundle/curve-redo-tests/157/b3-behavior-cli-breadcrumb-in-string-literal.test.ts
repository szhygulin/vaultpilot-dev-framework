import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoFile(relPath: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(dir, relPath);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find ${relPath}`);
}

const cliSource = readFileSync(findRepoFile("src/cli.ts"), "utf8");

test("breadcrumb contract: 'Run launched' marker must live inside a string literal (printable), not just a comment", () => {
  const idx = cliSource.search(/run launched/i);
  assert.ok(idx !== -1, "Source must contain 'Run launched' marker");
  // Find the start of the line containing the marker.
  const lineStart = cliSource.lastIndexOf("\n", idx) + 1;
  const lineEndIdx = cliSource.indexOf("\n", idx);
  const lineEnd = lineEndIdx === -1 ? cliSource.length : lineEndIdx;
  const line = cliSource.slice(lineStart, lineEnd);
  // A 100-char window around the marker should include a string-literal delimiter.
  const window = cliSource.slice(Math.max(0, idx - 100), Math.min(cliSource.length, idx + 100));
  // Must include a quote/backtick somewhere nearby (string literal).
  assert.match(
    window,
    /["'`]/,
    "'Run launched' must appear inside a string literal so it gets printed at runtime",
  );
  // And the immediate line should not be a pure // line comment.
  assert.ok(
    !/^\s*\/\//.test(line),
    "'Run launched' must not appear only inside a // line comment",
  );
});
