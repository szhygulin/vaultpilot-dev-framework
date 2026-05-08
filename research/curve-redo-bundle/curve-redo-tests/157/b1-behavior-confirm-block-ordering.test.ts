// The confirm-path breadcrumb must read top-to-bottom in the proposed order:
// 'Run launched' header -> 'Check progress' line -> 'Live tail' line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: confirm-path block orders 'Run launched' before 'Check progress' before 'Live tail'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launchedIdx = src.indexOf("Run launched");
  assert.ok(launchedIdx >= 0, "'Run launched' missing from cli.ts");
  const block = src.slice(launchedIdx, launchedIdx + 800);
  const progressInBlock = block.indexOf("Check progress");
  const tailInBlock = block.indexOf("Live tail");
  assert.ok(progressInBlock >= 0, "'Check progress' missing in confirm-path block");
  assert.ok(tailInBlock >= 0, "'Live tail' missing in confirm-path block");
  assert.ok(
    progressInBlock < tailInBlock,
    "'Check progress' must precede 'Live tail' inside the confirm block",
  );
});
