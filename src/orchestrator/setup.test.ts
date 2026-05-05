import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSetupPreview, type SetupPreview } from "./setup.js";
import type { DuplicateCluster } from "../types.js";

// Issue #151 (Phase 2a-ii of #133): integration tests for the dedup
// advisory block + dedup-cost line. Pure-function tests against
// `formatSetupPreview` — no SDK, no orchestrator, no live model. The
// surface under test is the gate-text rendering that the user reads
// before y/N (and that `hashPreview` binds into the plan→confirm token).

function basePreview(overrides: Partial<SetupPreview> = {}): SetupPreview {
  return {
    targetRepo: "octocat/repo",
    targetRepoPath: "/tmp/octocat-repo",
    rangeLabel: "100-110",
    openIssues: [
      { id: 100, title: "first", state: "open", labels: [] },
      { id: 110, title: "second", state: "open", labels: [] },
    ],
    closedSkipped: [],
    parallelism: 2,
    dryRun: false,
    resume: false,
    reusedAgents: [],
    newAgentsToMint: 1,
    authorized: 2,
    planned: 1,
    specialistCount: 0,
    generalCount: 1,
    overloadWarnings: [],
    triageSkipped: [],
    openPrSkipped: [],
    costForecast: [],
    budgetExceededSkipped: [],
    incompleteBranchesAvailable: [],
    duplicateClusters: [],
    ...overrides,
  };
}

test("formatSetupPreview: empty duplicateClusters renders no advisory block", () => {
  const text = formatSetupPreview(basePreview({ duplicateClusters: [] }));
  assert.doesNotMatch(
    text,
    /duplicate cluster/i,
    "no advisory block when clusters is empty",
  );
  assert.doesNotMatch(
    text,
    /Phase 2b will add --apply-dedup/,
    "no Phase 2b reference when no clusters were detected",
  );
});

test("formatSetupPreview: non-empty duplicateClusters renders the advisory block + rationale", () => {
  const clusters: DuplicateCluster[] = [
    {
      canonical: 100,
      duplicates: [110, 120],
      rationale:
        "Canonical #100 has the most-detailed body; #110 and #120 restate the same proposal.",
    },
  ];
  const text = formatSetupPreview(basePreview({ duplicateClusters: clusters }));
  assert.match(text, /1 duplicate cluster\(s\) detected/);
  assert.match(text, /advisory — all issues still dispatch/);
  assert.match(text, /canonical #100\s+duplicates #110, #120/);
  // Rationale is rendered indented beneath the cluster line.
  assert.match(text, /Canonical #100 has the most-detailed body/);
  assert.match(text, /Phase 2b will add --apply-dedup/);
});

test("formatSetupPreview: multiple clusters each render canonical + duplicates + rationale", () => {
  const clusters: DuplicateCluster[] = [
    {
      canonical: 5,
      duplicates: [6],
      rationale: "Canonical #5 keeps; #6 restates the same bug.",
    },
    {
      canonical: 50,
      duplicates: [51, 52],
      rationale: "Canonical #50 has more comments than #51/#52.",
    },
  ];
  const text = formatSetupPreview(basePreview({ duplicateClusters: clusters }));
  assert.match(text, /2 duplicate cluster\(s\) detected/);
  assert.match(text, /canonical #5\s+duplicates #6/);
  assert.match(text, /canonical #50\s+duplicates #51, #52/);
});

test("formatSetupPreview: dedupCostUsd renders parallel to triageCostUsd", () => {
  // Both lines present — the user sees what was already spent on each
  // pre-dispatch pass before y/N. Same "already incurred" framing.
  const text = formatSetupPreview(
    basePreview({ triageCostUsd: 0.0123, dedupCostUsd: 0.0456 }),
  );
  assert.match(text, /Triage cost:\s+~\$0\.0123 \(already incurred\)/);
  assert.match(text, /Dedup cost:\s+~\$0\.0456 \(already incurred\)/);
});

test("formatSetupPreview: undefined dedupCostUsd omits the line entirely (matches triage convention)", () => {
  // Mirrors #55 — distinguish "pass was bypassed" (omit) from "ran free"
  // (would show $0.0000). The renderer keys on `=== undefined`.
  const text = formatSetupPreview(basePreview({ dedupCostUsd: undefined }));
  assert.doesNotMatch(text, /Dedup cost:/);
});

test("formatSetupPreview: dedupCostUsd 0 still renders the line", () => {
  // A bypass returns `undefined`; a real call that costs $0 (cache hit
  // semantics, future-proofing) still renders so the audit trail shows
  // the pass actually executed.
  const text = formatSetupPreview(basePreview({ dedupCostUsd: 0 }));
  assert.match(text, /Dedup cost:\s+~\$0\.0000 \(already incurred\)/);
});

test("formatSetupPreview: cluster set + dedup cost are bound into the rendered text (previewHash coverage)", () => {
  // `hashPreview` runs on the formatted text, so anything rendered here
  // is automatically bound into the plan→confirm token. Two snapshots
  // that differ only in the cluster set MUST produce different text;
  // otherwise drift between --plan and --confirm would silently pass
  // the hash check.
  const a = formatSetupPreview(basePreview({ duplicateClusters: [] }));
  const b = formatSetupPreview(
    basePreview({
      duplicateClusters: [
        {
          canonical: 1,
          duplicates: [2],
          rationale: "Canonical #1 keeps.",
        },
      ],
    }),
  );
  assert.notEqual(a, b, "cluster drift must change rendered preview text");

  const c = formatSetupPreview(basePreview({ dedupCostUsd: undefined }));
  const d = formatSetupPreview(basePreview({ dedupCostUsd: 0.01 }));
  assert.notEqual(c, d, "dedup cost drift must change rendered preview text");
});
