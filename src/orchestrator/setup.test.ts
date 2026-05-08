import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSetupPreview, type SetupPreview } from "./setup.js";
import type { DuplicateCluster } from "../types.js";
import type { OverloadVerdict } from "../agent/split.js";

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
      { id: 100, title: "first", state: "open", labels: [], body: "" },
      { id: 110, title: "second", state: "open", labels: [], body: "" },
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
    dependencyDeferred: [],
    dependencyForceIncluded: [],
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
    /Pass --apply-dedup/,
    "no --apply-dedup hint when no clusters were detected",
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
  assert.match(text, /Pass --apply-dedup to close duplicates/);
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

// Issue #161: pre-dispatch overload warning text must branch on whether
// the splitter can actually produce a proposal. With fewer than 4
// attributable sections, `vp-dev agents split <id>` returns "Too few
// attributable sections (<4) to cluster meaningfully" — pointing the
// user at it from the warning is a "you should split this → can't split
// this" dead end. Verdict.attributableSections gates the text below.
test("formatSetupPreview: overload warning with >=4 sections points at `vp-dev agents split`", () => {
  const verdict: OverloadVerdict = {
    agentId: "agent-1234",
    reasons: ["CLAUDE.md=51.9KB >= 30KB", "tags=74 >= 50"],
    claudeMdBytes: 51_900,
    attributableSections: 12,
  };
  const text = formatSetupPreview(basePreview({ overloadWarnings: [verdict] }));
  assert.match(text, /WARNING: agent-1234 crossed split threshold/);
  assert.match(text, /CLAUDE\.md=51\.9KB >= 30KB/);
  assert.match(text, /Run `vp-dev agents split agent-1234` to view a split proposal\./);
  assert.doesNotMatch(text, /Splitter needs/);
});

test("formatSetupPreview: overload warning with <4 sections points at compaction path (#158), not the splitter", () => {
  const verdict: OverloadVerdict = {
    agentId: "agent-916a",
    reasons: ["CLAUDE.md=51.9KB >= 30KB", "tags=74 >= 50"],
    claudeMdBytes: 51_900,
    attributableSections: 3,
  };
  const text = formatSetupPreview(basePreview({ overloadWarnings: [verdict] }));
  assert.match(text, /WARNING: agent-916a crossed split threshold/);
  assert.match(
    text,
    /Splitter needs >=4 attributable sections; agent-916a has 3\. See #158 for the compaction path\./,
  );
  // Critical: do NOT recommend `vp-dev agents split` for an agent the
  // splitter will refuse — that's the dead-end UX the branch fixes.
  assert.doesNotMatch(text, /Run `vp-dev agents split agent-916a`/);
});

test("formatSetupPreview: per-agent branching — splittable + un-splittable agents in same run get different remediation lines", () => {
  // Mixed-overload run: agent-AAAA has lots of sections (post-summarizer
  // history) so the splitter will work; agent-BBBB has tons of size /
  // tag pressure but only 2 sections so the splitter would refuse. Each
  // gets its own remediation line.
  const verdicts: OverloadVerdict[] = [
    {
      agentId: "agent-AAAA",
      reasons: ["issuesHandled=22 >= 20"],
      claudeMdBytes: 20_000,
      attributableSections: 18,
    },
    {
      agentId: "agent-BBBB",
      reasons: ["CLAUDE.md=37.0KB >= 30KB"],
      claudeMdBytes: 37_888,
      attributableSections: 2,
    },
  ];
  const text = formatSetupPreview(basePreview({ overloadWarnings: verdicts }));
  assert.match(text, /Run `vp-dev agents split agent-AAAA` to view a split proposal\./);
  assert.match(
    text,
    /Splitter needs >=4 attributable sections; agent-BBBB has 2\. See #158 for the compaction path\./,
  );
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

// Issue #185: pre-dispatch dependency check renders. Same render-bound-into-
// previewHash story as the dedup block — drift between --plan and --confirm
// must change the rendered text.

test("formatSetupPreview: empty dependencyDeferred renders no skip block", () => {
  const text = formatSetupPreview(basePreview({ dependencyDeferred: [] }));
  assert.doesNotMatch(text, /declared prerequisite/);
  assert.doesNotMatch(text, /Override with --include-blocked/);
});

test("formatSetupPreview: non-empty dependencyDeferred renders the skip block + override hint", () => {
  const deferred = [
    {
      issue: { id: 180, title: "Phase 3 advisory", state: "open" as const, labels: [], body: "" },
      blockingVerdicts: [
        { ref: { issueId: 178 }, state: "open" as const },
      ],
      reason: "depends on open #178 — re-dispatch after #178 lands",
    },
  ];
  const text = formatSetupPreview(basePreview({ dependencyDeferred: deferred }));
  assert.match(text, /1 issue\(s\) deferred — declared prerequisite\(s\) not satisfied/);
  assert.match(text, /#180\s+depends on open #178 — re-dispatch after #178 lands/);
  assert.match(text, /Override with --include-blocked/);
});

test("formatSetupPreview: dependencyForceIncluded renders WARNING block (not deferred block)", () => {
  const forceIncluded = [
    {
      issue: { id: 180, title: "Phase 3 advisory", state: "open" as const, labels: [], body: "" },
      blockingVerdicts: [
        { ref: { issueId: 178 }, state: "open" as const },
      ],
      reason: "depends on open #178 — re-dispatch after #178 lands",
    },
  ];
  const text = formatSetupPreview(
    basePreview({ dependencyForceIncluded: forceIncluded, dependencyDeferred: [] }),
  );
  assert.match(text, /WARNING: 1 issue\(s\) with unsatisfied prerequisites force-included via --include-blocked/);
  assert.match(text, /#180\s+depends on open #178/);
  // Override hint is NOT rendered in force-included mode (the operator
  // already passed the override).
  assert.doesNotMatch(text, /Override with --include-blocked/);
});

test("formatSetupPreview: dependency block drift changes the rendered text (previewHash coverage)", () => {
  const a = formatSetupPreview(basePreview({ dependencyDeferred: [] }));
  const b = formatSetupPreview(
    basePreview({
      dependencyDeferred: [
        {
          issue: { id: 50, title: "x", state: "open", labels: [], body: "" },
          blockingVerdicts: [{ ref: { issueId: 40 }, state: "open" }],
          reason: "depends on open #40 — re-dispatch after #40 lands",
        },
      ],
    }),
  );
  assert.notEqual(a, b, "dependency-deferred drift must change rendered preview text");

  const c = formatSetupPreview(basePreview({ dependencyForceIncluded: [] }));
  const d = formatSetupPreview(
    basePreview({
      dependencyForceIncluded: [
        {
          issue: { id: 50, title: "x", state: "open", labels: [], body: "" },
          blockingVerdicts: [{ ref: { issueId: 40 }, state: "open" }],
          reason: "depends on open #40 — re-dispatch after #40 lands",
        },
      ],
    }),
  );
  assert.notEqual(c, d, "force-included drift must change rendered preview text");
});

// =====================================================================
// Issue #249: per-issue forecast source label for the rolling-history
// fallback. The label is `(no plan; rolling history, N runs)` so the
// operator sees the calibration provenance + sample count, distinct from
// the legacy `(no plan; fallback estimate)` static-constant label.
// =====================================================================

test("formatSetupPreview: rolling-history forecast label surfaces sample count", () => {
  const text = formatSetupPreview(
    basePreview({
      costForecast: [
        {
          issueId: 100,
          estimateUsd: 5.12,
          source: "history-fallback",
          historySampleCount: 11,
        },
      ],
    }),
  );
  assert.match(text, /Per-issue cost forecast:/);
  assert.match(text, /#100\s+~\$5\.12\s+\(no plan; rolling history, 11 runs\)/);
  // Legacy static-fallback label MUST NOT leak into the history-fallback
  // render — they're distinct provenance signals.
  assert.doesNotMatch(text, /\(no plan; fallback estimate\)/);
});

test("formatSetupPreview: rolling-history label uses singular `1 run` for sampleCount=1", () => {
  // A single historical run is technically calibration data but a thin
  // signal — the singular label flags this so the operator can judge.
  const text = formatSetupPreview(
    basePreview({
      costForecast: [
        {
          issueId: 100,
          estimateUsd: 4.0,
          source: "history-fallback",
          historySampleCount: 1,
        },
      ],
    }),
  );
  assert.match(text, /\(no plan; rolling history, 1 run\)/);
  // Defensive: must NOT pluralize "1 runs" — that's a quality smell.
  assert.doesNotMatch(text, /1 runs/);
});

test("formatSetupPreview: legacy fallback label still renders when source is `fallback`", () => {
  // The history-fallback variant is opt-in (only when prior runs exist).
  // First-install dispatches still render the legacy label so the operator
  // sees they're getting an uncalibrated estimate.
  const text = formatSetupPreview(
    basePreview({
      costForecast: [
        { issueId: 200, estimateUsd: 1.5, source: "fallback" },
      ],
    }),
  );
  assert.match(text, /#200\s+~\$1\.50\s+\(no plan; fallback estimate\)/);
  assert.doesNotMatch(text, /rolling history/);
});

test("formatSetupPreview: forecast source drift changes rendered preview (previewHash coverage)", () => {
  // Same per-issue $ amount, different provenance label. The plan→confirm
  // token MUST treat these as different previews so a state-dir change
  // between --plan and --confirm rejects the confirm and forces a
  // re-plan with the up-to-date calibration.
  const a = formatSetupPreview(
    basePreview({
      costForecast: [
        { issueId: 100, estimateUsd: 1.5, source: "fallback" },
      ],
    }),
  );
  const b = formatSetupPreview(
    basePreview({
      costForecast: [
        {
          issueId: 100,
          estimateUsd: 1.5,
          source: "history-fallback",
          historySampleCount: 5,
        },
      ],
    }),
  );
  assert.notEqual(a, b, "history-fallback vs fallback must change rendered text");
});
