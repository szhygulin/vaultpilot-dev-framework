// The proposed breadcrumb format uses an inline '#' comment to annotate the
// canonical command. Verify that the 'Check progress' line has a hash
// comment naming the 'active run' context.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Check progress' line carries a '# active run' annotation", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  // Issue's exact line:
  //   '  Check progress: vp-dev status            # active run, no args needed'
  assert.match(src, /Check progress[^\n]*#[^\n]*active run/);
});
