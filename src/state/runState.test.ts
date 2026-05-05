import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLatestRunIdFromEntries } from "./runState.js";

test("pickLatestRunIdFromEntries: ignores run-confirm-*.json token files (#125)", () => {
  // Repro shape: state/ contains a real run-state file plus a confirm
  // token. Loose `startsWith("run-")` lex-sorted the token last (`'c' >
  // '2'`) and returned `run-confirm-...`, which loadRunState parsed as
  // valid JSON and formatStatusText then crashed on `Object.keys(state.issues)`.
  const entries = [
    "agents-registry.json",
    "current-run.txt",
    "run-2026-05-05T14-26-37-251Z.json",
    "run-confirm-1bc06c6f01894bd6.json",
  ];
  assert.equal(
    pickLatestRunIdFromEntries(entries),
    "run-2026-05-05T14-26-37-251Z",
  );
});

test("pickLatestRunIdFromEntries: returns null on empty directory", () => {
  assert.equal(pickLatestRunIdFromEntries([]), null);
});

test("pickLatestRunIdFromEntries: returns null when only non-run-state files present", () => {
  assert.equal(
    pickLatestRunIdFromEntries([
      "agents-registry.json",
      "current-run.txt",
      "run-confirm-abc.json",
      "run-summary-xyz.json",
    ]),
    null,
  );
});

test("pickLatestRunIdFromEntries: lex-sort is chronological for ISO-timestamp filenames", () => {
  const entries = [
    "run-2026-05-05T14-26-37-251Z.json",
    "run-2026-05-05T14-31-12-100Z.json",
    "run-2026-05-04T09-00-00-000Z.json",
  ];
  assert.equal(
    pickLatestRunIdFromEntries(entries),
    "run-2026-05-05T14-31-12-100Z",
  );
});

test("pickLatestRunIdFromEntries: rejects ambiguous run-* prefixes that aren't run-state files", () => {
  // Defense against future state-file kinds sharing the `run-` prefix:
  // anything that doesn't look like `run-<YYYY>-<MM>-<DD>T...` is skipped.
  for (const sneak of [
    "run-confirm-deadbeef.json",
    "run-summary-2026-05-05.json",
    "run-tmp.json",
    "run-.json",
    "run-2026.json",
    "run-2026-05.json",
  ]) {
    assert.equal(
      pickLatestRunIdFromEntries([sneak]),
      null,
      `expected ${sneak} to be filtered out`,
    );
  }
});
