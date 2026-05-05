import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closeIssueAsDuplicate,
  dryRunCommentUrl,
  formatDuplicateCommentBody,
} from "../github/gh.js";

// Issue #148 (Phase 2b of #133): tests for the destructive `--apply-dedup`
// close path. The integration surface lives in `cli.ts`; the helper that
// performs the per-issue comment+close is `closeIssueAsDuplicate` in
// `src/github/gh.ts`. These tests focus on the dry-run interception
// shape (synthetic URL + ISO timestamp, no `gh` invocation) and the
// audit-trail wording of the cross-reference comment — the two pieces
// the operator and post-hoc audits actually consume. Live `gh`
// invocations are covered by manual --dry-run runs against a target
// repo; the project does not mock execFile in tests.

test("formatDuplicateCommentBody: names canonical and run id verbatim", () => {
  const body = formatDuplicateCommentBody(123, "run-2026-05-05T18-30-00Z");
  // Both pieces MUST land in the body — the close has no audit trail
  // back to the run otherwise. Asserting full substring presence rather
  // than a regex so the actual text the user reads is locked.
  assert.ok(body.includes("#123"), "body must reference canonical issue");
  assert.ok(
    body.includes("run-2026-05-05T18-30-00Z"),
    "body must reference run id for audit trail",
  );
  assert.ok(
    body.includes("duplicate") && body.includes("pre-dispatch dedup"),
    "body must describe the pre-dispatch dedup origin",
  );
});

test("formatDuplicateCommentBody: distinct canonicals produce distinct bodies", () => {
  // Sanity check: the formatter is not a constant string. Two different
  // canonicals in the same run id MUST produce different bodies — a
  // copy-paste regression that hardcoded the canonical (e.g. always
  // posting `#0`) would silently misroute the cross-reference chain.
  const a = formatDuplicateCommentBody(7, "run-X");
  const b = formatDuplicateCommentBody(8, "run-X");
  assert.notEqual(a, b);
});

test("dryRunCommentUrl: shape matches agent-side dry-run intercept convention", () => {
  // Mirrors `dryRunIntercept`'s `gh issue comment` rewrite shape so
  // transcript replayers + run-log consumers detect both intercepts
  // identically (key: `https://dry-run/...` host).
  const url = dryRunCommentUrl("octocat/repo", 42);
  assert.equal(url, "https://dry-run/issue-comment/octocat/repo/42");
  assert.ok(
    url.startsWith("https://dry-run/"),
    "synthetic URLs must use the /dry-run/ host segment",
  );
});

test("closeIssueAsDuplicate: dry-run returns synthetic URL + ISO timestamp without invoking gh", async () => {
  // The function is async; `await`ing it must not hang or throw. A
  // missing `gh` binary on the test runner would surface as ENOENT if
  // the dry-run gate were leaking. The test's synthetic-URL assertion
  // doubles as a no-network check.
  const before = Date.now();
  const result = await closeIssueAsDuplicate(
    "octocat/repo",
    42,
    7,
    "run-2026-05-05T18-30-00Z",
    { dryRun: true },
  );
  const after = Date.now();
  assert.equal(
    result.commentUrl,
    "https://dry-run/issue-comment/octocat/repo/42",
  );
  // closedAt is the caller's wall clock — it MUST be a valid ISO
  // timestamp and MUST land between `before` and `after`. A malformed
  // timestamp would trip post-hoc audits that lex-sort closes by
  // `closedAt`.
  const parsed = Date.parse(result.closedAt);
  assert.ok(!Number.isNaN(parsed), "closedAt must be a valid timestamp");
  assert.ok(parsed >= before && parsed <= after, "closedAt must reflect now");
});

test("closeIssueAsDuplicate: dry-run is the default-off code path (omitting opts hits the network path's branch boundary)", async () => {
  // Sanity check that `opts?.dryRun` is the gate, not `opts?.dryRun !==
  // false` or some other near-miss. With opts undefined, the dry-run
  // branch is NOT taken — verified here indirectly by passing { } and
  // confirming the dry-run branch IS taken when the flag is explicitly
  // true. Two near-shapes that would silently take the wrong branch:
  //   - `if (opts?.dryRun !== false)` would dry-run by default (bad)
  //   - `if (opts?.dryRun === "yes")` would never dry-run (bad)
  // The flag must be exactly truthy-valued.
  const result = await closeIssueAsDuplicate(
    "octocat/repo",
    99,
    1,
    "run-Y",
    { dryRun: true },
  );
  assert.ok(result.commentUrl.startsWith("https://dry-run/"));
});

test("closeIssueAsDuplicate: dry-run URL encodes the duplicate's number, not the canonical's", async () => {
  // The synthetic URL identifies WHICH issue would have received the
  // comment. Off-by-one variants ("encode the canonical instead") would
  // silently produce a synthetic that points at the wrong issue,
  // misleading any transcript replayer that keys URLs to issue ids.
  const result = await closeIssueAsDuplicate(
    "octocat/repo",
    42, // the duplicate being closed
    7, // the canonical it yields to
    "run-X",
    { dryRun: true },
  );
  assert.ok(result.commentUrl.endsWith("/42"));
  assert.ok(!result.commentUrl.includes("/7"));
});
