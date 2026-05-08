// The 'Live tail' label must appear close to 'vp-dev status --watch' so
// operators connect the breadcrumb to the actual live-tail command.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Live tail' label is paired with 'vp-dev status --watch' command", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Live tail[\s\S]{0,200}vp-dev status --watch/);
});
