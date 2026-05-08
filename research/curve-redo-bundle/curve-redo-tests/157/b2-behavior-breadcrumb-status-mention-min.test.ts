// Edge case: minimum (single-occurrence) boundary — the breadcrumb must mention
// 'vp-dev status' at least once as the discoverable progress-check affordance.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadCli(): string {
  const cwd = resolve(process.cwd(), "src/cli.ts");
  if (existsSync(cwd)) return readFileSync(cwd, "utf8");
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const p = resolve(dir, "src/cli.ts");
    if (existsSync(p)) return readFileSync(p, "utf8");
    dir = resolve(dir, "..");
  }
  throw new Error("src/cli.ts not found");
}

const cliSrc = loadCli();

test("breadcrumb: cli mentions 'vp-dev status' literal at least once", () => {
  assert.ok(
    cliSrc.includes("vp-dev status"),
    "expected src/cli.ts to mention 'vp-dev status' as a discoverable breadcrumb",
  );
});
