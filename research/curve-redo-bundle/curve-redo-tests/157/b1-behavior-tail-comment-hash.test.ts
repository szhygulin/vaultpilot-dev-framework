// The proposed breadcrumb format uses an inline '#' comment to annotate the
// --watch command. Verify that the 'Live tail' line has a hash comment
// naming the re-render/interval behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Live tail' line carries a '# re-renders on interval' annotation", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  // Issue's exact line:
  //   '  Live tail:      vp-dev status --watch    # re-renders on interval'
  assert.match(src, /Live tail[^\n]*#[^\n]*(?:re-renders|interval)/);
});
