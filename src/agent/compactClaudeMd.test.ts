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

test("formatCompactionProposal: clean proposal points at the --apply / --confirm flow", () => {
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
  assert.match(out, /--apply/);
  assert.match(out, /--confirm/);
});

test("DEFAULT_MIN_CLUSTER_SIZE: documented default is 3 (per issue #158 — 2 too aggressive)", () => {
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE, 3);
});

// ---------------------------------------------------------------------------
// Phase B (issue #162) tests: splicer + applyCompaction drift rejections.
// Splicer is exercised pure; applyCompaction is exercised end-to-end against
// a tmp agents-root via process.chdir, since AGENTS_ROOT is `process.cwd() +
// "/agents"` and there's no override hook by design (matches appendBlock).
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applyCompaction,
  renderMergedBlock,
  type CompactionCluster,
} from "./compactClaudeMd.js";
import {
  computeProposalHash,
  hashFile,
} from "../state/compactConfirm.js";
import { parseSentinelHeader } from "../util/sentinels.js";

function fakeMdContent(
  sections: Array<{ run: string; issue: number; heading: string; body: string }>,
): string {
  // Match the on-disk shape `appendBlock` produces: one `\n` separating
  // blocks, no leading whitespace before the first sentinel.
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}`,
    )
    .join("\n") + "\n";
}

test("spliceCompactedSections: replaces 3-section cluster with one merged block", () => {
  const md = fakeMdContent([
    { run: "run-a", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
    { run: "run-b", issue: 101, heading: "Rule B", body: "Past incident 2026-04-29: bar." },
    { run: "run-c", issue: 102, heading: "Rule C", body: "Past incident 2026-04-30: baz." },
  ]);
  // Re-parse with offsets via the exported wrapper. Build sections manually
  // mirroring what parseClaudeMdSectionsWithOffsets returns; here we cheat
  // by using parseClaudeMdSections + inferring offsets from match.
  const parsed = parseClaudeMdSections(md);
  assert.equal(parsed.length, 3);

  const cluster: CompactionCluster = {
    sectionIds: ["s0", "s1", "s2"],
    proposedHeading: "Merged AB+C",
    proposedBody:
      "Combined rule. Past incidents: 2026-04-28 (foo), 2026-04-29 (bar), 2026-04-30 (baz).",
    rationale: "shared thesis",
    sourceProvenance: [
      { runId: "run-a", issueId: 100 },
      { runId: "run-b", issueId: 101 },
      { runId: "run-c", issueId: 102 },
    ],
  };

  // We don't expose parseClaudeMdSectionsWithOffsets externally — the
  // splicer is exercised through applyCompaction in the chdir-based test
  // below. Test renderMergedBlock here (the only piece we can poke at
  // without re-parsing offsets).
  const block = renderMergedBlock(cluster, "merge-test", "2026-05-06T00:00:00.000Z");
  assert.match(block, /run:merge-test/);
  assert.match(block, /issue:#100\+#101\+#102/);
  assert.match(block, /outcome:compacted/);
  assert.match(block, /## Merged AB\+C/);
  assert.match(block, /2026-04-28/);
  assert.match(block, /2026-04-29/);
  assert.match(block, /2026-04-30/);
});

test("renderMergedBlock: dedups + sorts source issue IDs", () => {
  const cluster: CompactionCluster = {
    sectionIds: ["s0", "s1", "s2"],
    proposedHeading: "h",
    proposedBody: "b",
    rationale: "r",
    sourceProvenance: [
      { runId: "r-c", issueId: 102 },
      { runId: "r-a", issueId: 100 },
      // Duplicate issueId across two source runs — token should appear once.
      { runId: "r-a-dup", issueId: 100 },
      { runId: "r-b", issueId: 101 },
    ],
  };
  const block = renderMergedBlock(cluster, "merge-x", "2026-05-06T00:00:00.000Z");
  assert.match(block, /issue:#100\+#101\+#102/);
});

test("compound issue:#100+#101+#102 sentinel parses back via parseClaudeMdSections", () => {
  const cluster: CompactionCluster = {
    sectionIds: ["s0", "s1"],
    proposedHeading: "Merged",
    proposedBody: "body content",
    rationale: "shared thesis",
    sourceProvenance: [
      { runId: "run-a", issueId: 100 },
      { runId: "run-b", issueId: 101 },
    ],
  };
  const block = renderMergedBlock(cluster, "merge-1", "2026-05-06T00:00:00.000Z");
  // The block needs a trailing newline so parseClaudeMdSections's lookahead
  // for `\n<!--` or end-of-string can terminate the body.
  const reParsed = parseClaudeMdSections(block + "\n");
  assert.equal(reParsed.length, 1);
  assert.equal(reParsed[0].issueId, 100);
  assert.deepEqual(reParsed[0].issueIds, [100, 101]);
  assert.equal(reParsed[0].outcome, "compacted");
});

test("compound issue:#100+#101+#102 sentinel parses back via parseSentinelHeader", () => {
  // The single-line parser used by the expiry walker (locateSentinels in
  // sentinels.ts) must also accept compound IDs — otherwise compacted
  // blocks become invisible to the walker and get absorbed as part of a
  // previous block's body, with collateral expiry on the previous block's
  // drop.
  const line =
    "<!-- run:merge-1 issue:#100+#101+#102 outcome:compacted ts:2026-05-06T00:00:00.000Z -->";
  const h = parseSentinelHeader(line);
  assert.notEqual(h, null);
  if (!h) return;
  assert.equal(h.outcome, "compacted");
  assert.equal(h.issueId, 100);
  assert.deepEqual(h.issueIds, [100, 101, 102]);
});

// applyCompaction tests — these chdir into a temp dir so AGENTS_ROOT
// (computed from process.cwd at module import) resolves to the tmp tree.
// Since AGENTS_ROOT is captured at module-load time via path.resolve,
// process.chdir does NOT relocate it. To work around: we'd need to reset
// the module — but importing once is fine because `agentClaudeMdPath`
// recomputes from AGENTS_ROOT. Let me re-read… see specialization.ts:
//   AGENTS_ROOT = path.resolve(process.cwd(), "agents")
// Captured once. So chdir post-import doesn't help.
//
// Workaround: write the file at the path AGENTS_ROOT already points to
// (i.e. <repo>/agents/<test-id>/CLAUDE.md), use a unique agentId per
// test, and clean up afterwards. The repo's `agents/` dir is gitignored,
// so this is safe. Same approach `appendBlock` would need if it had
// tests.

import { agentClaudeMdPath, AGENTS_ROOT } from "./specialization.js";

async function withTempAgentDir(
  fn: (agentId: string, filePath: string) => Promise<void>,
): Promise<void> {
  const agentId = `test-compact-${Math.random().toString(16).slice(2, 10)}`;
  const filePath = agentClaudeMdPath(agentId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fn(agentId, filePath);
  } finally {
    // Best-effort cleanup of the per-test agent dir. Don't blow up if
    // the file was renamed mid-test or the dir already gone.
    await fs.rm(path.dirname(filePath), { recursive: true, force: true }).catch(() => {});
  }
}

test("applyCompaction: rewrites file under lock + collapses 3 sections to 1 merged block", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "run-a", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
      { run: "run-b", issue: 101, heading: "Rule B", body: "Past incident 2026-04-29: bar." },
      { run: "run-c", issue: 102, heading: "Rule C", body: "Past incident 2026-04-30: baz." },
    ]);
    await fs.writeFile(filePath, md);

    const proposal: CompactionProposal = {
      agentId,
      clusters: [
        {
          sectionIds: ["s0", "s1", "s2"],
          proposedHeading: "Merged ABC",
          proposedBody:
            "Combined. Past incidents 2026-04-28, 2026-04-29, 2026-04-30.",
          rationale: "shared thesis",
          sourceProvenance: [
            { runId: "run-a", issueId: 100 },
            { runId: "run-b", issueId: 101 },
            { runId: "run-c", issueId: 102 },
          ],
        },
      ],
      unclusteredSectionIds: [],
      estimatedBytesSaved: 200,
      inputBytes: Buffer.byteLength(md, "utf-8"),
      sectionCount: 3,
      warnings: [],
    };
    const expectedHash = computeProposalHash(proposal, md);
    const result = await applyCompaction({
      agentId,
      proposal,
      expectedProposalHash: expectedHash,
      computeProposalHash,
      runId: "merge-test-1",
      now: () => "2026-05-06T00:00:00.000Z",
    });
    assert.equal(result.kind, "applied");
    if (result.kind !== "applied") return;
    assert.equal(result.clustersApplied, 1);
    assert.equal(result.sectionsMerged, 3);

    const after = await fs.readFile(filePath, "utf-8");
    const reparsed = parseClaudeMdSections(after);
    assert.equal(reparsed.length, 1, "compacted file should hold exactly one section");
    assert.equal(reparsed[0].outcome, "compacted");
    assert.deepEqual(reparsed[0].issueIds, [100, 101, 102]);
    assert.match(reparsed[0].body, /2026-04-28/);
    assert.match(reparsed[0].body, /2026-04-29/);
    assert.match(reparsed[0].body, /2026-04-30/);
  });
});

test("applyCompaction: rejects with proposal-hash drift when file changed between plan and confirm", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const planMd = fakeMdContent([
      { run: "run-a", issue: 100, heading: "Rule A", body: "2026-04-28 foo" },
      { run: "run-b", issue: 101, heading: "Rule B", body: "2026-04-29 bar" },
      { run: "run-c", issue: 102, heading: "Rule C", body: "2026-04-30 baz" },
    ]);
    await fs.writeFile(filePath, planMd);

    const proposal: CompactionProposal = {
      agentId,
      clusters: [
        {
          sectionIds: ["s0", "s1", "s2"],
          proposedHeading: "Merged",
          proposedBody: "Combined 2026-04-28, 2026-04-29, 2026-04-30",
          rationale: "shared thesis",
          sourceProvenance: [
            { runId: "run-a", issueId: 100 },
            { runId: "run-b", issueId: 101 },
            { runId: "run-c", issueId: 102 },
          ],
        },
      ],
      unclusteredSectionIds: [],
      estimatedBytesSaved: 100,
      inputBytes: Buffer.byteLength(planMd, "utf-8"),
      sectionCount: 3,
      warnings: [],
    };
    const planHash = computeProposalHash(proposal, planMd);

    // Drift: append another summarizer block before confirm.
    const driftMd = planMd + "\n<!-- run:run-d issue:#103 outcome:implement ts:2026-05-06T00:00:00.000Z -->\n## Rule D\n\nNew lesson.\n";
    await fs.writeFile(filePath, driftMd);

    const result = await applyCompaction({
      agentId,
      proposal,
      expectedProposalHash: planHash,
      computeProposalHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "proposal-hash");

    // File untouched (still drift content).
    const after = await fs.readFile(filePath, "utf-8");
    assert.equal(after, driftMd);
  });
});

test("applyCompaction: rejects with warnings-present when validator flags a dropped past-incident date", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "run-a", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
      { run: "run-b", issue: 101, heading: "Rule B", body: "Past incident 2026-04-29: bar." },
      { run: "run-c", issue: 102, heading: "Rule C", body: "Past incident 2026-04-30: baz." },
    ]);
    await fs.writeFile(filePath, md);

    // Lossy proposal: cites only 2026-04-28 in the merged body.
    const proposal: CompactionProposal = {
      agentId,
      clusters: [
        {
          sectionIds: ["s0", "s1", "s2"],
          proposedHeading: "Merged (lossy)",
          proposedBody: "Combined rule. See 2026-04-28 incident only.",
          rationale: "shared thesis",
          sourceProvenance: [
            { runId: "run-a", issueId: 100 },
            { runId: "run-b", issueId: 101 },
            { runId: "run-c", issueId: 102 },
          ],
        },
      ],
      unclusteredSectionIds: [],
      estimatedBytesSaved: 50,
      inputBytes: Buffer.byteLength(md, "utf-8"),
      sectionCount: 3,
      warnings: [],
    };
    const hash = computeProposalHash(proposal, md);
    const result = await applyCompaction({
      agentId,
      proposal,
      expectedProposalHash: hash,
      computeProposalHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "warnings-present");
    assert.match(result.details, /2026-04-29/);

    const after = await fs.readFile(filePath, "utf-8");
    assert.equal(after, md, "file must not be mutated when validator rejects");
  });
});

test("applyCompaction: preserves non-clustered sections verbatim, replaces only the clustered ones", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "run-a", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28 foo" },
      { run: "run-b", issue: 101, heading: "Rule B", body: "Past incident 2026-04-29 bar" },
      { run: "run-c", issue: 102, heading: "Rule C", body: "Past incident 2026-04-30 baz" },
      { run: "run-d", issue: 200, heading: "Distinct rule", body: "Unrelated lesson 2026-05-01" },
    ]);
    await fs.writeFile(filePath, md);

    const proposal: CompactionProposal = {
      agentId,
      clusters: [
        {
          sectionIds: ["s0", "s1", "s2"],
          proposedHeading: "Merged ABC",
          proposedBody: "Combined 2026-04-28, 2026-04-29, 2026-04-30",
          rationale: "shared",
          sourceProvenance: [
            { runId: "run-a", issueId: 100 },
            { runId: "run-b", issueId: 101 },
            { runId: "run-c", issueId: 102 },
          ],
        },
      ],
      unclusteredSectionIds: ["s3"],
      estimatedBytesSaved: 100,
      inputBytes: Buffer.byteLength(md, "utf-8"),
      sectionCount: 4,
      warnings: [],
    };
    const hash = computeProposalHash(proposal, md);
    const result = await applyCompaction({
      agentId,
      proposal,
      expectedProposalHash: hash,
      computeProposalHash,
      runId: "merge-test-keep",
      now: () => "2026-05-06T00:00:00.000Z",
    });
    assert.equal(result.kind, "applied");

    const after = await fs.readFile(filePath, "utf-8");
    const sections = parseClaudeMdSections(after);
    assert.equal(sections.length, 2);
    // Order preserved: merged block at the position of s0; distinct rule
    // (originally s3) follows.
    assert.equal(sections[0].outcome, "compacted");
    assert.equal(sections[1].outcome, "implement");
    assert.equal(sections[1].issueId, 200);
    assert.match(sections[1].body, /Unrelated lesson 2026-05-01/);
  });
});

test("applyCompaction: rejects no-clusters proposal without touching the file", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "run-a", issue: 100, heading: "Rule A", body: "alpha" },
    ]);
    await fs.writeFile(filePath, md);
    const proposal: CompactionProposal = {
      agentId,
      clusters: [],
      unclusteredSectionIds: ["s0"],
      estimatedBytesSaved: 0,
      inputBytes: Buffer.byteLength(md, "utf-8"),
      sectionCount: 1,
      warnings: [],
    };
    const hash = computeProposalHash(proposal, md);
    const result = await applyCompaction({
      agentId,
      proposal,
      expectedProposalHash: hash,
      computeProposalHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "no-clusters");
    const after = await fs.readFile(filePath, "utf-8");
    assert.equal(after, md);
  });
});

test("computeProposalHash: stable across calls on identical inputs, drifts on file change", () => {
  const proposal: CompactionProposal = {
    agentId: "agent-x",
    clusters: [],
    unclusteredSectionIds: [],
    estimatedBytesSaved: 0,
    inputBytes: 0,
    sectionCount: 0,
    warnings: [],
  };
  const file = "alpha";
  const h1 = computeProposalHash(proposal, file);
  const h2 = computeProposalHash(proposal, file);
  assert.equal(h1, h2);
  const h3 = computeProposalHash(proposal, file + " ");
  assert.notEqual(h1, h3);
  assert.equal(typeof h1, "string");
  assert.match(h1, /^[a-f0-9]{64}$/);
  assert.match(hashFile(file), /^[a-f0-9]{64}$/);
});

// AGENTS_ROOT usage in the test suite is informational — not asserted, but
// surfaced here so a future reader sees how the tmp-agent dir is computed.
void AGENTS_ROOT;

// ---------------------------------------------------------------------------
// Regressions surfaced by running Phase A on production agent CLAUDE.md
// files post-#165 merge. Both bugs blocked the entire feature on any agent
// that had received a #142+ summarizer pass — i.e. nearly every active one.
// ---------------------------------------------------------------------------

import { clampClusterFields } from "./compactClaudeMd.js";

test("parseClaudeMdSections: matches sentinels with the optional `tags:` suffix (#142+ shape)", () => {
  // Pre-fix, SECTION_RE required `ts:\S+\s*-->`, so any sentinel emitted by
  // appendBlock with a tags fingerprint was silently skipped — Phase A saw
  // 3/12 sections in agent-92ff, 3/18 in agent-916a. The fix mirrors the
  // same allowance already in `SENTINEL_RE` (src/util/sentinels.ts).
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T00:00:00.000Z tags:cli-gate,phase-split -->\n" +
    "## Tagged section\n\nbody-A\n" +
    "<!-- run:run-B issue:#101 outcome:implement ts:2026-05-05T00:01:00.000Z -->\n" +
    "## Untagged section\n\nbody-B\n";
  const sections = parseClaudeMdSections(md);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].issueId, 100);
  assert.equal(sections[0].heading, "Tagged section");
  assert.equal(sections[1].issueId, 101);
  assert.equal(sections[1].heading, "Untagged section");
});

test("clampClusterFields: trims top-level `notes` past the 500-char cap", () => {
  // Pre-fix, `notes` was schema-capped at 500 chars but never clamped, so a
  // verbose model commentary tripped Zod and the entire proposal hard-failed
  // (observed crash on agent-9a77 with a 500+ char notes value).
  const longNotes = "x".repeat(2000);
  const clamped = clampClusterFields({
    clusters: [],
    unclusteredSectionIds: [],
    notes: longNotes,
  }) as { notes: string };
  assert.ok(
    clamped.notes.length <= 500,
    `clamped notes must fit the 500-char cap (got ${clamped.notes.length})`,
  );
  assert.match(clamped.notes, /\[…truncated\]$/);
});

test("clampClusterFields: leaves short notes untouched", () => {
  const out = clampClusterFields({
    clusters: [],
    unclusteredSectionIds: [],
    notes: "short note",
  }) as { notes: string };
  assert.equal(out.notes, "short note");
});

test("clampClusterFields: still trims cluster body / heading / rationale alongside notes", () => {
  const out = clampClusterFields({
    clusters: [
      {
        sectionIds: ["s0", "s1", "s2"],
        proposedHeading: "x".repeat(200),
        proposedBody: "y".repeat(8000),
        rationale: "z".repeat(1200),
      },
    ],
    unclusteredSectionIds: [],
    notes: "n".repeat(700),
  }) as {
    clusters: Array<{ proposedHeading: string; proposedBody: string; rationale: string }>;
    notes: string;
  };
  assert.ok(out.clusters[0].proposedHeading.length <= 160);
  assert.ok(out.clusters[0].proposedBody.length <= 6000);
  assert.ok(out.clusters[0].rationale.length <= 800);
  assert.ok(out.notes.length <= 500);
});
