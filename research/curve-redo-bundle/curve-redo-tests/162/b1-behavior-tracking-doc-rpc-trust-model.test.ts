import { test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === "test-results" ||
      name === "patches"
    )
      continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else yield full;
  }
}

test("docs mention RPC as the input vector for the bigint-buffer issue", () => {
  let found = false;
  for (const f of walk(ROOT)) {
    if (!f.endsWith(".md")) continue;
    const body = readFileSync(f, "utf8").toLowerCase();
    if (
      body.includes("bigint-buffer") &&
      (body.includes("rpc") || body.includes("helius") || body.includes("quicknode"))
    ) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
});
