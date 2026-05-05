import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPushPartial } from "./shouldPushPartial.js";
import type { ResultEnvelope } from "../types.js";

// Issue #95: the partial-branch safety net (PR #92) was scoped to
// `errorSubtype === "error_max_turns"`. This predicate broadens it to
// every non-clean exit shape the SDK can surface today, plus a slot for
// #86's cost-ceiling abort.

const dummyEnvelope: ResultEnvelope = {
  decision: "implement",
  reason: "test",
  memoryUpdate: { addTags: [] },
};

test("shouldPushPartial: error_max_turns trips (original PR #92 case)", () => {
  assert.equal(
    shouldPushPartial({
      errorSubtype: "error_max_turns",
      isError: true,
      envelope: undefined,
    }),
    true,
  );
});

test("shouldPushPartial: error_during_execution trips (mid-tool-use throw)", () => {
  assert.equal(
    shouldPushPartial({
      errorSubtype: "error_during_execution",
      isError: true,
      envelope: undefined,
    }),
    true,
  );
});

test("shouldPushPartial: error_max_budget_usd trips (future-proofing for #86)", () => {
  // The SDK doesn't surface this subtype yet — once #86's cost ceiling
  // lands and the SDK starts tagging budget-truncated runs, the predicate
  // matches without further code changes.
  assert.equal(
    shouldPushPartial({
      errorSubtype: "error_max_budget_usd",
      isError: true,
      envelope: undefined,
    }),
    true,
  );
});

test("shouldPushPartial: catch-all isError && !envelope trips when subtype absent", () => {
  // Generic non-clean exit: SDK didn't tag a known subtype but
  // `runCodingAgent` flagged the run as failed and produced no parseable
  // terminal envelope. Without this branch the safety net would silently
  // skip every untagged failure mode.
  assert.equal(
    shouldPushPartial({
      errorSubtype: undefined,
      isError: true,
      envelope: undefined,
    }),
    true,
  );
});

test("shouldPushPartial: clean implement decision does NOT trip", () => {
  // Clean run with envelope present and no error — the most common path,
  // and the one that must stay false to avoid creating spurious
  // `-incomplete-<runId>` branches alongside successful PRs.
  assert.equal(
    shouldPushPartial({
      errorSubtype: undefined,
      isError: false,
      envelope: dummyEnvelope,
    }),
    false,
  );
});

test("shouldPushPartial: pushback envelope without error does NOT trip", () => {
  // Agent emitted a clean pushback decision; nothing to salvage.
  assert.equal(
    shouldPushPartial({
      errorSubtype: undefined,
      isError: false,
      envelope: { ...dummyEnvelope, decision: "pushback" },
    }),
    false,
  );
});

test("shouldPushPartial: error envelope (decision='error') with no subtype does NOT trip — orthogonal gate", () => {
  // Recovery succeeded enough that a structured envelope was parsed but
  // the decision was "error" and `isError` stayed true (e.g. recovery2b
  // failed). No envelope-decision check lives in this predicate — the
  // call site handles `decision !== "implement"` orthogonally — so the
  // catch-all `isError && !envelope` does NOT match here (envelope is
  // present). The errorSubtype path is the relevant gate; if neither
  // matches, the predicate stays false and the call-site gate is the
  // single source of truth on whether to proceed.
  assert.equal(
    shouldPushPartial({
      errorSubtype: undefined,
      isError: true,
      envelope: { ...dummyEnvelope, decision: "error" },
    }),
    false,
  );
});

test("shouldPushPartial: unknown errorSubtype with isError + envelope present does NOT trip", () => {
  // Future SDK subtype we haven't whitelisted; envelope was nonetheless
  // parseable. Conservative default: don't fire the safety net unless
  // we're sure. Once such a subtype starts appearing in real runs it can
  // be added explicitly.
  assert.equal(
    shouldPushPartial({
      errorSubtype: "error_some_future_subtype",
      isError: true,
      envelope: dummyEnvelope,
    }),
    false,
  );
});

test("shouldPushPartial: isError=false with no envelope does NOT trip", () => {
  // Defensive: if `runCodingAgent` somehow returns no envelope without
  // marking isError, the catch-all explicitly requires `isError` to be
  // true so we don't salvage from a transient parser blip on an
  // otherwise-clean run.
  assert.equal(
    shouldPushPartial({
      errorSubtype: undefined,
      isError: false,
      envelope: undefined,
    }),
    false,
  );
});
