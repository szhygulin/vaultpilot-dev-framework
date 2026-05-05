// Phase A (issue #158) tests: schema-validator boundary cases, the
// collapsed-distinct-rules validator, and the dry-run formatter shape.
// No LLM is called — `proposeCompaction` is exercised end-to-end only
// indirectly via its pure helpers, since the live network/SDK call is the
// expensive part and adds nothing to per-PR coverage.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MIN_CLUSTER_SIZE,
  extractDistinctDates,
  findDroppedIncidentDates,
  formatCompactionProposal,
  type CompactionProposal,
} from "./compactClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("extractDistinctDates: pulls ISO-style dates, ignores version numbers", () => {
  const dates = extractDistinctDates(
    "Past incident 2026-05-05: thing happened. Version 1.2.345 and 12-34-56 do not count. Also 2026-04-28 cited.",
  );
  assert.deepEqual([...dates].sort(), ["2026-04-28", "2026-05-05"]);
});

test("extractDistinctDates: returns empty set for body with no dates", () => {
  const dates = extractDistinctDates("No incidents cited here.");
  assert.equal(dates.size, 0);
});

test("findDroppedIncidentDates: flags cluster where merged body drops a source date", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
    { run: "run-B", issue: 101, heading: "Rule B", body: "Past incident 2026-05-05: bar." },
    { run: "run-C", issue: 102, heading: "Rule C", body: "Past incident 2026-05-05: also bar." },
  ]);
  const sections = parseClaudeMdSections(md);
  assert.equal(sections.length, 3);

  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1", "s2"],
          proposedHeading: "Merged",
          // Drops 2026-04-28 entirely; mentions 2026-05-05 only.
          proposedBody: "Combined: see 2026-05-05 incident.",
          rationale: "merged",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "dropped-incident-date");
  assert.deepEqual(warnings[0].missingDates, ["2026-04-28"]);
  assert.deepEqual(warnings[0].fromSectionIds, ["s0"]);
});

test("findDroppedIncidentDates: clean merge with all source dates preserved -> no warning", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
    { run: "run-B", issue: 101, heading: "Rule B", body: "Past incident 2026-05-05: bar." },
    { run: "run-C", issue: 102, heading: "Rule C", body: "Past incident 2026-04-29: baz." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1", "s2"],
          proposedHeading: "Merged",
          proposedBody:
            "Combined rule. Past incidents: 2026-04-28 (foo), 2026-04-29 (baz), 2026-05-05 (bar).",
          rationale: "merged",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 0);
});

test("findDroppedIncidentDates: ignores clusters whose source sections cite no dates", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "No dates here." },
    { run: "run-B", issue: 101, heading: "Rule B", body: "Or here." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Merged",
          proposedBody: "Combined rule, no dates.",
          rationale: "merged",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 0);
});

test("findDroppedIncidentDates: clusterIndex matches the position in the input array", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "A", body: "2026-01-01 thing" },
    { run: "run-B", issue: 101, heading: "B", body: "2026-02-02 thing" },
    { run: "run-C", issue: 102, heading: "C", body: "2026-03-03 thing" },
    { run: "run-D", issue: 103, heading: "D", body: "2026-04-04 thing" },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Clean",
          proposedBody: "Cites 2026-01-01 and 2026-02-02.",
          rationale: "ok",
          sourceProvenance: [],
        },
        {
          sectionIds: ["s2", "s3"],
          proposedHeading: "Drops one",
          proposedBody: "Cites only 2026-03-03.",
          rationale: "lossy",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].clusterIndex, 1);
  assert.deepEqual(warnings[0].missingDates, ["2026-04-04"]);
});

test("formatCompactionProposal: zero-cluster proposal renders the no-op note", () => {
  const proposal: CompactionProposal = {
    agentId: "agent-test",
    clusters: [],
    unclusteredSectionIds: ["s0", "s1"],
    estimatedBytesSaved: 0,
    inputBytes: 4096,
    sectionCount: 2,
    notes: "Too few attributable sections (2) to compact at min-cluster-size=3.",
    warnings: [],
  };
  const out = formatCompactionProposal(proposal);
  assert.match(out, /Compaction proposal for agent-test/);
  assert.match(out, /no merge clusters proposed/);
  assert.match(out, /Too few attributable sections/);
});

test("formatCompactionProposal: surfaces dropped-date warnings inline per cluster", () => {
  const proposal: CompactionProposal = {
    agentId: "agent-test",
    clusters: [
      {
        sectionIds: ["s0", "s1", "s2"],
        proposedHeading: "Merged rule",
        proposedBody: "body",
        rationale: "shared thesis",
        sourceProvenance: [
          { runId: "run-A", issueId: 100 },
          { runId: "run-B", issueId: 101 },
        ],
      },
    ],
    unclusteredSectionIds: ["s3"],
    estimatedBytesSaved: 2048,
    inputBytes: 10240,
    sectionCount: 4,
    warnings: [
      {
        kind: "dropped-incident-date",
        clusterIndex: 0,
        missingDates: ["2026-04-28"],
        fromSectionIds: ["s0"],
      },
    ],
  };
  const out = formatCompactionProposal(proposal);
  assert.match(out, /Merged rule/);
  assert.match(out, /merging 3 sections/);
  assert.match(out, /provenance: #100, #101/);
  assert.match(out, /DROPPED DATES: 2026-04-28/);
  assert.match(out, /1 cluster\(s\) flagged/);
  assert.match(out, /Unclustered \(1\): s3/);
});

test("formatCompactionProposal: clean proposal advertises Phase A advisory note", () => {
  const proposal: CompactionProposal = {
    agentId: "agent-test",
    clusters: [
      {
        sectionIds: ["s0", "s1", "s2"],
        proposedHeading: "Merged",
        proposedBody: "body",
        rationale: "ok",
        sourceProvenance: [],
      },
    ],
    unclusteredSectionIds: [],
    estimatedBytesSaved: 1024,
    inputBytes: 8192,
    sectionCount: 3,
    warnings: [],
  };
  const out = formatCompactionProposal(proposal);
  assert.match(out, /No validator warnings/);
  assert.match(out, /#162/);
});

test("DEFAULT_MIN_CLUSTER_SIZE: documented default is 3 (per issue #158 — 2 too aggressive)", () => {
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE, 3);
});
