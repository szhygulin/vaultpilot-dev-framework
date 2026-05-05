import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEnvelope } from "./parseResult.js";

// Issue #141 (Phase 1 of #134): the `ResultEnvelope` Zod schema accepts an
// optional `nextPhaseIssueUrl` URL field. These tests pin the field's
// presence + URL validation so a future schema refactor (e.g., dropping
// `.url()` for plain `.string()`) is caught immediately. The schema itself
// lives in `src/types.ts` but `extractEnvelope` is the call site every
// production parse goes through, so testing here covers the round-trip
// shape callers actually see.

const base = {
  decision: "implement" as const,
  reason: "Did the thing.",
  prUrl: "https://github.com/o/r/pull/1",
  memoryUpdate: { addTags: ["x"] },
};

function envelope(extra: Record<string, unknown> = {}): string {
  return "```json\n" + JSON.stringify({ ...base, ...extra }) + "\n```";
}

test("extractEnvelope: nextPhaseIssueUrl is accepted when a valid URL", () => {
  const r = extractEnvelope(
    envelope({ nextPhaseIssueUrl: "https://github.com/o/r/issues/142" }),
  );
  assert.equal(r.ok, true);
  assert.equal(
    r.envelope?.nextPhaseIssueUrl,
    "https://github.com/o/r/issues/142",
  );
});

test("extractEnvelope: nextPhaseIssueUrl is optional — absence does not fail validation", () => {
  const r = extractEnvelope(envelope());
  assert.equal(r.ok, true);
  assert.equal(r.envelope?.nextPhaseIssueUrl, undefined);
});

test("extractEnvelope: nextPhaseIssueUrl rejects malformed values", () => {
  const r = extractEnvelope(envelope({ nextPhaseIssueUrl: "not-a-url" }));
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /Schema validation failed/);
});
