import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDedupResponse } from "../orchestrator/dedup.js";
import type { RunState, DuplicateCluster } from "../types.js";

// Pure-function unit tests for the dedup response parser (issue #150,
// Phase 2a-i of #133). These do NOT invoke the SDK or the dedup model —
// the parsing rubric is exercised directly so the tests stay fast,
// deterministic, and free of API spend.

test("parseDedupResponse: well-formed model output → typed DuplicateCluster[]", () => {
  const raw = JSON.stringify({
    clusters: [
      {
        canonical: 100,
        duplicates: [110, 120],
        rationale:
          "Canonical #100 has the most-detailed body and predates the others; all three request the same feature flag.",
      },
    ],
  });
  const out = parseDedupResponse(raw);
  assert.ok(out, "expected typed array on well-formed output");
  assert.equal(out!.length, 1);
  assert.equal(out![0].canonical, 100);
  assert.deepEqual(out![0].duplicates, [110, 120]);
  assert.match(out![0].rationale, /#100/);
});

test("parseDedupResponse: rationale is non-empty and references the canonical", () => {
  // The system prompt asks the model to name the canonical in the
  // rationale so the gate-render block in Phase 2a-ii can show "why
  // #100 was kept" without re-deriving the rationale at render time.
  const raw = JSON.stringify({
    clusters: [
      {
        canonical: 42,
        duplicates: [50, 51],
        rationale:
          "Canonical #42 was filed earliest and accumulated 8 review comments; #50 and #51 restate the same bug.",
      },
    ],
  });
  const out = parseDedupResponse(raw);
  assert.ok(out);
  assert.equal(out!.length, 1);
  const cluster = out![0];
  assert.ok(cluster.rationale.length > 0, "rationale must be non-empty");
  assert.ok(
    cluster.rationale.includes(`#${cluster.canonical}`),
    `rationale should reference canonical #${cluster.canonical}; got: ${cluster.rationale}`,
  );
});

test("parseDedupResponse: no overlap → empty cluster array, NOT null", () => {
  // Critical contract: an empty `clusters` array is the model's signal
  // that no duplicates were found. The parser must return `[]` (not
  // `null`) so the caller can distinguish "no duplicates" from "couldn't
  // parse". `null` is reserved for the parse-failure case.
  const raw = JSON.stringify({ clusters: [] });
  const out = parseDedupResponse(raw);
  assert.ok(Array.isArray(out), "no-overlap must return an array, not null");
  assert.equal(out!.length, 0);
});

test("parseDedupResponse: malformed JSON → null (parse failure case)", () => {
  for (const bad of [
    "not json at all",
    '{"clusters": [malformed',
    '{"foo": "bar"}', // valid JSON, wrong shape
    '{"clusters": [{"canonical": "not a number", "duplicates": [1], "rationale": "x"}]}',
    '{"clusters": [{"canonical": 1, "duplicates": [], "rationale": "empty dup list"}]}',
    '{"clusters": [{"canonical": 1, "duplicates": [2], "rationale": ""}]}',
  ]) {
    assert.equal(
      parseDedupResponse(bad),
      null,
      `expected null for malformed input: ${bad.slice(0, 60)}`,
    );
  }
});

test("parseDedupResponse: tolerates ```json``` fence wrapper around the object", () => {
  // The model occasionally fences its JSON output despite the prompt
  // forbidding it. The parser falls back to fence-stripping (mirrors
  // triage.ts's parseJsonLoose) so a single naughty model output
  // doesn't fail the whole dedup pass.
  const raw = "```json\n" + JSON.stringify({
    clusters: [
      {
        canonical: 7,
        duplicates: [8],
        rationale: "Canonical #7 has more comments than #8; both request the same refactor.",
      },
    ],
  }) + "\n```";
  const out = parseDedupResponse(raw);
  assert.ok(out);
  assert.equal(out!.length, 1);
  assert.equal(out![0].canonical, 7);
});

test("parseDedupResponse: drops cluster where canonical also appears in duplicates", () => {
  // Hard rule from the system prompt: "Each issue number appears in AT
  // MOST one cluster, either as canonical or in duplicates — never both."
  // A model that violates this would ship a cluster like {canonical: 5,
  // duplicates: [5, 6]} which silently corrupts Phase 2a-ii's render.
  const raw = JSON.stringify({
    clusters: [
      {
        canonical: 5,
        duplicates: [5, 6],
        rationale: "Canonical #5 — invalid self-reference",
      },
      {
        canonical: 10,
        duplicates: [11],
        rationale: "Canonical #10 has more comments than #11.",
      },
    ],
  });
  const out = parseDedupResponse(raw);
  assert.ok(out);
  assert.equal(out!.length, 1, "the self-referencing cluster must be filtered out");
  assert.equal(out![0].canonical, 10);
});

test("parseDedupResponse: drops clusters referencing issues outside validIssueIds", () => {
  // Hallucinated issue numbers are a real failure mode — the model
  // occasionally invents a plausible-looking integer. The validIssueIds
  // gate keeps phantom canonicals out of the run-state field that
  // Phase 2a-ii will eventually render in the approval gate.
  const raw = JSON.stringify({
    clusters: [
      {
        canonical: 999, // not in the batch
        duplicates: [100],
        rationale: "Canonical #999 hallucinated by the model.",
      },
      {
        canonical: 100,
        duplicates: [110],
        rationale: "Canonical #100 has the most-detailed body.",
      },
    ],
  });
  const validIds = new Set([100, 110, 120]);
  const out = parseDedupResponse(raw, validIds);
  assert.ok(out);
  assert.equal(out!.length, 1, "the hallucinated-canonical cluster must be filtered out");
  assert.equal(out![0].canonical, 100);
});

test("parseDedupResponse: dedupes a duplicates array containing repeated entries", () => {
  // Defensive parsing — the model occasionally lists the same duplicate
  // twice. The downstream gate-render block expects unique entries.
  const raw = JSON.stringify({
    clusters: [
      {
        canonical: 1,
        duplicates: [2, 2, 3, 2],
        rationale: "Canonical #1 keeps; the others restate the same proposal.",
      },
    ],
  });
  const out = parseDedupResponse(raw);
  assert.ok(out);
  assert.equal(out!.length, 1);
  assert.deepEqual(out![0].duplicates, [2, 3]);
});

// Schema round-trip test for the RunState extension (issue #150).
// Optional fields must survive JSON.stringify → JSON.parse without
// crashing or losing data; equally, a state object that omits the
// fields entirely must remain a valid RunState shape.
test("RunState round-trip: duplicateClustersDetected + dedupCostUsd survive JSON serialization", () => {
  const clusters: DuplicateCluster[] = [
    {
      canonical: 100,
      duplicates: [110, 120],
      rationale: "Canonical #100 has the most-detailed body of the three.",
    },
  ];
  const original: RunState = {
    runId: "run-2026-05-05T00-00-00-000Z",
    targetRepo: "owner/repo",
    issueRange: { kind: "csv", ids: [100, 110, 120] },
    parallelism: 1,
    agents: [],
    issues: {
      "100": { status: "pending" },
      "110": { status: "pending" },
      "120": { status: "pending" },
    },
    tickCount: 0,
    lastTickAt: "2026-05-05T00:00:00.000Z",
    startedAt: "2026-05-05T00:00:00.000Z",
    dryRun: false,
    duplicateClustersDetected: clusters,
    dedupCostUsd: 0.0473,
  };
  const round: RunState = JSON.parse(JSON.stringify(original));
  assert.deepEqual(round.duplicateClustersDetected, clusters);
  assert.equal(round.dedupCostUsd, 0.0473);
});

test("RunState round-trip: omitted dedup fields stay omitted (back-compat)", () => {
  // A pre-#150 run-state file has neither field. The interface marks
  // both optional so the type-checker accepts the omission, and a
  // round-trip leaves them undefined — never `null`, which would surface
  // as a falsy-but-present field that breaks `if (state.dedupCostUsd)`
  // call sites in Phase 2a-ii.
  const original: RunState = {
    runId: "run-2026-05-05T00-00-00-000Z",
    targetRepo: "owner/repo",
    issueRange: { kind: "all-open" },
    parallelism: 2,
    agents: [],
    issues: {},
    tickCount: 0,
    lastTickAt: "2026-05-05T00:00:00.000Z",
    startedAt: "2026-05-05T00:00:00.000Z",
    dryRun: true,
  };
  const round: RunState = JSON.parse(JSON.stringify(original));
  assert.equal(round.duplicateClustersDetected, undefined);
  assert.equal(round.dedupCostUsd, undefined);
});
