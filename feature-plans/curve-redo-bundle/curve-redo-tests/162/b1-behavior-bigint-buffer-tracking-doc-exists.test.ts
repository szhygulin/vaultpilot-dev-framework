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
      name === "test-results"
    )
      continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else yield full;
  }
}

test("some markdown file references GHSA-3gc7-fjrx-p6mg", () => {
  let found = false;
  for (const f of walk(ROOT)) {
    if (!f.endsWith(".md")) continue;
    const body = readFileSync(f, "utf8");
    if (body.includes("GHSA-3gc7-fjrx-p6mg")) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
});
