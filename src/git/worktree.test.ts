import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIncompleteBranchName } from "./worktree.js";

// Canonical runId shape from `makeRunId()`:
// `run-2026-05-04T16-53-06-188Z` — alphanumerics, `-`, `T`, `Z`. Already
// git-ref-safe; the helper passes it through.
test("preserves canonical run-<iso> runId verbatim", () => {
  const branch = buildIncompleteBranchName(
    "vp-dev/agent-72c6/issue-88",
    "run-2026-05-04T16-53-06-188Z",
  );
  assert.equal(
    branch,
    "vp-dev/agent-72c6/issue-88-incomplete-run-2026-05-04T16-53-06-188Z",
  );
});

test("sanitizes runId chars that aren't alphanumeric or '-'", () => {
  // Hypothetical future runId formats with `:`, `.`, `/` etc. would break
  // git ref rules — the helper must scrub them.
  const branch = buildIncompleteBranchName(
    "vp-dev/agent-aa26/issue-34",
    "run-2026:05:04T17.48.07/803Z",
  );
  // `:` `.` `/` all mapped to `-`. The original branch slashes stay.
  assert.equal(
    branch,
    "vp-dev/agent-aa26/issue-34-incomplete-run-2026-05-04T17-48-07-803Z",
  );
});

test("does not match the stale-branch sweep regex (anchored vp-dev pattern)", () => {
  // Defensive check: the existing prune sweep uses
  //   /^vp-dev\/(agent-[a-z0-9]+)\/issue-(\d+)$/
  // The trailing `$` plus the `-incomplete-<runId>` suffix means our
  // labeled refs are NOT auto-cleaned by the sweep. Encoded here so a
  // future regex tweak in worktree.ts doesn't silently start eating the
  // salvage branches.
  const sweepRegex = /^vp-dev\/(agent-[a-z0-9]+)\/issue-(\d+)$/;
  const incomplete = buildIncompleteBranchName(
    "vp-dev/agent-72c6/issue-88",
    "run-2026-05-04T16-53-06-188Z",
  );
  assert.equal(sweepRegex.test(incomplete), false);
  // Sanity: the original (pre-suffix) branch DOES match the sweep regex.
  assert.equal(sweepRegex.test("vp-dev/agent-72c6/issue-88"), true);
});

test("preserves multi-digit issue numbers and lowercase agent ids", () => {
  const branch = buildIncompleteBranchName(
    "vp-dev/agent-ef41/issue-1234",
    "run-X",
  );
  assert.equal(branch, "vp-dev/agent-ef41/issue-1234-incomplete-run-X");
});
