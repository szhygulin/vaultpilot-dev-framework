import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  filterByRetention,
  lookupRunStateRef,
  parseIncompleteRefs,
  parseLsRemoteIncompleteRefs,
  resolveRetentionDays,
  DEFAULT_INCOMPLETE_RETENTION_DAYS,
} from "./incompleteBranches.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 15, 12, 0, 0); // 2026-05-15T12:00:00Z

test("parseIncompleteRefs: extracts agent/issue/runId and computes ageDays", () => {
  // 14 days back, in unix seconds
  const committerUnix = Math.floor((NOW - 14 * DAY_MS) / 1000);
  const out = parseIncompleteRefs(
    [
      {
        branch: "vp-dev/agent-75a0/issue-88-incomplete-run-2026-05-01T12-00-00-000Z",
        committerUnix,
      },
    ],
    NOW,
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    branch: "vp-dev/agent-75a0/issue-88-incomplete-run-2026-05-01T12-00-00-000Z",
    agentId: "agent-75a0",
    issueId: 88,
    runId: "run-2026-05-01T12-00-00-000Z",
    committerDate: new Date(committerUnix * 1000).toISOString(),
    ageDays: 14,
  });
});

test("parseIncompleteRefs: drops malformed branches silently", () => {
  // Anchored regex rejects:
  //   - the regular vp-dev branch shape (no `-incomplete-` segment)
  //   - human-authored branches at the same prefix (uppercase agent id)
  //   - branches missing `issue-` prefix
  const out = parseIncompleteRefs(
    [
      { branch: "vp-dev/agent-aa00/issue-1", committerUnix: 0 },
      { branch: "vp-dev/agent-AB/issue-1-incomplete-run-x", committerUnix: 0 },
      { branch: "vp-dev/agent-aa00/1-incomplete-run-x", committerUnix: 0 },
      { branch: "renovate/main-incomplete-r", committerUnix: 0 },
    ],
    NOW,
  );
  assert.deepEqual(out, []);
});

test("parseIncompleteRefs: ageDays floors at zero for future-dated commits", () => {
  // Clock skew between machines can put committerdate slightly ahead of now.
  const committerUnix = Math.floor((NOW + 5 * 60 * 1000) / 1000);
  const out = parseIncompleteRefs(
    [
      {
        branch: "vp-dev/agent-aa00/issue-1-incomplete-run-x",
        committerUnix,
      },
    ],
    NOW,
  );
  assert.equal(out[0].ageDays, 0);
});

test("parseIncompleteRefs: multi-digit issue numbers and runIds with hyphens", () => {
  const committerUnix = Math.floor(NOW / 1000) - 30 * 24 * 60 * 60;
  const out = parseIncompleteRefs(
    [
      {
        branch: "vp-dev/agent-ef41/issue-1234-incomplete-run-2026-05-01T12-00-00-000Z",
        committerUnix,
      },
    ],
    NOW,
  );
  assert.equal(out[0].issueId, 1234);
  assert.equal(out[0].runId, "run-2026-05-01T12-00-00-000Z");
  assert.equal(out[0].ageDays, 30);
});

test("filterByRetention: includes branches at exactly the threshold (>=)", () => {
  const branches = [
    { ageDays: 0 },
    { ageDays: 13 },
    { ageDays: 14 },
    { ageDays: 100 },
  ];
  // Threshold-inclusive: a 14-day-old ref crosses a 14-day retention.
  // Closes the off-by-one between "kept long enough" and "ready to surface".
  const out = filterByRetention(branches, 14);
  assert.deepEqual(
    out.map((b) => b.ageDays),
    [14, 100],
  );
});

test("filterByRetention: retentionDays of 0 surfaces every branch", () => {
  const branches = [{ ageDays: 0 }, { ageDays: 1 }];
  assert.equal(filterByRetention(branches, 0).length, 2);
});

test("filterByRetention: negative retentionDays is treated as 0 (defensive)", () => {
  const branches = [{ ageDays: 0 }, { ageDays: 5 }];
  assert.equal(filterByRetention(branches, -7).length, 2);
});

test("resolveRetentionDays: flag wins over env over default", () => {
  assert.equal(
    resolveRetentionDays({ flag: 7, env: { INCOMPLETE_BRANCH_RETENTION_DAYS: "30" } }),
    7,
  );
  assert.equal(
    resolveRetentionDays({ env: { INCOMPLETE_BRANCH_RETENTION_DAYS: "30" } }),
    30,
  );
  assert.equal(
    resolveRetentionDays({ env: {} }),
    DEFAULT_INCOMPLETE_RETENTION_DAYS,
  );
});

test("resolveRetentionDays: rejects malformed env (NaN, zero, negative)", () => {
  // Defensive: an operator setting `INCOMPLETE_BRANCH_RETENTION_DAYS=0`
  // (or `-1`, or `"abc"`) shouldn't silently surface every ref. Falls back
  // to the default rather than honoring the misconfigured value.
  for (const bad of ["abc", "0", "-1", "", " "]) {
    assert.equal(
      resolveRetentionDays({ env: { INCOMPLETE_BRANCH_RETENTION_DAYS: bad } }),
      DEFAULT_INCOMPLETE_RETENTION_DAYS,
    );
  }
});

test("lookupRunStateRef: 'present' when state file references the branch", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "incomplete-test-"));
  try {
    const runId = "run-2026-05-01T12-00-00-000Z";
    const branch = `vp-dev/agent-75a0/issue-88-incomplete-${runId}`;
    const state = {
      runId,
      issues: {
        "88": {
          status: "failed",
          partialBranchUrl: `https://github.com/owner/repo/tree/${encodeURIComponent(branch)}`,
        },
      },
    };
    await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify(state));
    assert.equal(await lookupRunStateRef(branch, runId, dir), "present");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("lookupRunStateRef: 'present-no-ref' when state exists but no entry references the branch", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "incomplete-test-"));
  try {
    const runId = "run-2026-05-01T12-00-00-000Z";
    const branch = `vp-dev/agent-75a0/issue-88-incomplete-${runId}`;
    const state = {
      runId,
      issues: {
        "88": { status: "done" }, // no partialBranchUrl
      },
    };
    await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify(state));
    assert.equal(await lookupRunStateRef(branch, runId, dir), "present-no-ref");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("lookupRunStateRef: 'missing' when state file does not exist", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "incomplete-test-"));
  try {
    const branch = "vp-dev/agent-75a0/issue-88-incomplete-run-X";
    assert.equal(await lookupRunStateRef(branch, "run-X", dir), "missing");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("lookupRunStateRef: malformed JSON treated as 'missing' (no throw)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "incomplete-test-"));
  try {
    const runId = "run-X";
    await fs.writeFile(path.join(dir, `${runId}.json`), "{not json");
    const branch = `vp-dev/agent-75a0/issue-88-incomplete-${runId}`;
    assert.equal(await lookupRunStateRef(branch, runId, dir), "missing");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ---- parseLsRemoteIncompleteRefs (issue #118 Phase 1) -------------------

test("parseLsRemoteIncompleteRefs: extracts (issue, agent, runId) from ls-remote --heads output", () => {
  // Real `git ls-remote --heads origin <pattern>` output: `<sha>\trefs/heads/<branch>`
  const lines = [
    "deadbeef0000000000000000000000000000beef\trefs/heads/vp-dev/agent-75a0/issue-88-incomplete-run-2026-05-01T12-00-00-000Z",
    "cafebabe0000000000000000000000000000cafe\trefs/heads/vp-dev/agent-ef41/issue-1234-incomplete-run-2026-05-02T08-30-00-000Z",
  ];
  const out = parseLsRemoteIncompleteRefs(lines);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    issueId: 88,
    agentId: "agent-75a0",
    branchName: "vp-dev/agent-75a0/issue-88-incomplete-run-2026-05-01T12-00-00-000Z",
    runId: "run-2026-05-01T12-00-00-000Z",
  });
  assert.equal(out[1].issueId, 1234);
  assert.equal(out[1].agentId, "agent-ef41");
});

test("parseLsRemoteIncompleteRefs: drops non-matching refs (regular vp-dev branches, malformed lines)", () => {
  // The ls-remote glob may also surface uninteresting refs if a future
  // caller widens the pattern; the parser must drop them silently rather
  // than throwing.
  const lines = [
    "sha1\trefs/heads/vp-dev/agent-aa00/issue-1", // regular vp-dev branch — no -incomplete- suffix
    "sha2\trefs/heads/main",
    "no-tab-line", // entire line missing the SHA\tref shape
    "", // blank line (often present at the trailing newline of stdout)
    "sha3\trefs/heads/vp-dev/agent-AB/issue-1-incomplete-run-x", // uppercase agent id rejected
    "sha4\trefs/heads/vp-dev/agent-bb11/issue-42-incomplete-run-OK", // valid
  ];
  const out = parseLsRemoteIncompleteRefs(lines);
  assert.equal(out.length, 1);
  assert.equal(out[0].issueId, 42);
  assert.equal(out[0].runId, "run-OK");
});

test("parseLsRemoteIncompleteRefs: tolerates refs not prefixed with `refs/heads/` (defensive)", () => {
  // Some git invocations / future format flags may emit short refs.
  // Parser strips the prefix when present but also accepts unprefixed.
  const lines = [
    "sha1\tvp-dev/agent-bb11/issue-7-incomplete-run-Z",
  ];
  const out = parseLsRemoteIncompleteRefs(lines);
  assert.equal(out.length, 1);
  assert.equal(out[0].branchName, "vp-dev/agent-bb11/issue-7-incomplete-run-Z");
});

test("parseLsRemoteIncompleteRefs: empty input yields empty output", () => {
  assert.deepEqual(parseLsRemoteIncompleteRefs([]), []);
});

test("lookupRunStateRef: matches across multiple issues in the state file", async () => {
  // Real state files often have several issues — confirm we scan all of
  // them, not just the first.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "incomplete-test-"));
  try {
    const runId = "run-2026-05-01T12-00-00-000Z";
    const branch = `vp-dev/agent-75a0/issue-99-incomplete-${runId}`;
    const state = {
      runId,
      issues: {
        "88": { status: "done", prUrl: "https://github.com/o/r/pull/1" },
        "99": {
          status: "failed",
          partialBranchUrl: `https://github.com/o/r/tree/${encodeURIComponent(branch)}`,
        },
      },
    };
    await fs.writeFile(path.join(dir, `${runId}.json`), JSON.stringify(state));
    assert.equal(await lookupRunStateRef(branch, runId, dir), "present");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
