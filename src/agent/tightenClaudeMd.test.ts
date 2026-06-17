// Phase A (issue #172) tests: invariant-extraction matchers, the
// dropped-invariant validator (each warning kind), savings-cap warning,
// schema clamp, and the dry-run formatter shape. No LLM is called —
// `proposeTighten` is exercised end-to-end only indirectly via its pure
// helpers, since the live network/SDK call is the expensive part and
// adds nothing to per-PR coverage.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_DIFF_LINES,
  DEFAULT_MAX_SAVINGS_PCT,
  MIN_DIFF_SAVINGS_BYTES,
  clampRewriteFields,
  extractDistinctDates,
  extractDistinctNumerics,
  extractDistinctXrefs,
  findDroppedInvariants,
  formatRewriteDiff,
  formatTightenProposal,
  lineDiff,
  type SectionRewrite,
  type TightenProposal,
} from "./tightenClaudeMd.js";
import { parseClaudeMdSections, type ParsedSection } from "./split.js";

function fakeMd(
  sections: Array<{ run: string; issue: number; heading: string; body: string }>,
): string {
  return (
    sections
      .map(
        (s) =>
          `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}`,
      )
      .join("\n") + "\n"
  );
}

test("extractDistinctDates: pulls ISO-style dates, ignores version numbers", () => {
  const dates = extractDistinctDates(
    "Past incident 2026-05-05: thing happened. Version 1.2.345 and 12-34-56 do not count. Also 2026-04-28 cited.",
  );
  assert.deepEqual([...dates].sort(), ["2026-04-28", "2026-05-05"]);
});

test("extractDistinctXrefs: pulls #NNN issue/PR refs", () => {
  const refs = extractDistinctXrefs(
    "See [#162](https://example) and #170 and PR #171. Tag #data is not a ref (no digits).",
  );
  // Note: `#171.` — trailing punctuation is fine, regex stops at non-digit.
  assert.deepEqual([...refs].sort(), ["#162", "#170", "#171"]);
});

test("extractDistinctXrefs: returns empty set for body with no cross-refs", () => {
  const refs = extractDistinctXrefs("Plain text with no GitHub refs.");
  assert.equal(refs.size, 0);
});

test("extractDistinctNumerics: pulls number+unit pairs, normalizes unit case", () => {
  const nums = extractDistinctNumerics(
    "30KB threshold; 50 turns budget; 15 min TTL; 1.5× calibration; 40% cap; 30 kb again.",
  );
  // `30KB` and `30 kb` normalize to the same token (case-insensitive on
  // the unit, exact on the number).
  assert.ok(nums.has("30kb"));
  assert.ok(nums.has("50turns"));
  assert.ok(nums.has("15min"));
  assert.ok(nums.has("1.5×"));
  assert.ok(nums.has("40%"));
  // `30 kb` should collapse with `30KB` — same token.
  const allKb = [...nums].filter((n) => n.endsWith("kb"));
  assert.equal(allKb.length, 1);
});

test("extractDistinctNumerics: returns empty set for body with no recognized numerics", () => {
  // Bare numerics without recognized units don't match — conservative on
  // purpose to avoid false positives on version numbers, line counts, etc.
  const nums = extractDistinctNumerics("K=3 factor 1.5 step 12.");
  assert.equal(nums.size, 0);
});

test("findDroppedInvariants: flags rewrite that drops an ISO date", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body: "Past incident 2026-04-28: foo. Past incident 2026-05-05: bar.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants({
    rewrites: [
      {
        sectionId: "s0",
        rewrittenBody: "Combined rule. Past incident 2026-05-05 only.",
        estimatedBytesSaved: 10,
      },
    ],
    sections,
    maxSavingsPct: 100, // disable savings warning to isolate the date check
  });
  const dateWarn = warnings.find((w) => w.kind === "dropped-incident-date");
  assert.ok(dateWarn, "expected a dropped-incident-date warning");
  if (dateWarn?.kind === "dropped-incident-date") {
    assert.deepEqual(dateWarn.missingDates, ["2026-04-28"]);
  }
});

test("findDroppedInvariants: flags rewrite that drops a #NNN cross-reference", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body: "See #162 and #165 for context. The fix landed in #166.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants({
    rewrites: [
      {
        sectionId: "s0",
        // Drops #166 entirely.
        rewrittenBody: "See #162 and #165 for context.",
        estimatedBytesSaved: 30,
      },
    ],
    sections,
    maxSavingsPct: 100,
  });
  const refWarn = warnings.find((w) => w.kind === "dropped-cross-reference");
  assert.ok(refWarn, "expected a dropped-cross-reference warning");
  if (refWarn?.kind === "dropped-cross-reference") {
    assert.deepEqual(refWarn.missingRefs, ["#166"]);
  }
});

test("findDroppedInvariants: flags rewrite that drops a numeric threshold", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body: "30KB threshold; 50 turns budget; 15 min TTL.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants({
    rewrites: [
      {
        sectionId: "s0",
        // Drops 50 turns.
        rewrittenBody: "30KB threshold; 15 min TTL.",
        estimatedBytesSaved: 12,
      },
    ],
    sections,
    maxSavingsPct: 100,
  });
  const numWarn = warnings.find((w) => w.kind === "dropped-numeric-threshold");
  assert.ok(numWarn, "expected a dropped-numeric-threshold warning");
  if (numWarn?.kind === "dropped-numeric-threshold") {
    assert.deepEqual(numWarn.missingNumerics, ["50turns"]);
  }
});

test("findDroppedInvariants: clean rewrite with all invariants preserved -> no warning", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body: "Past incident 2026-04-28; see #162; 30KB threshold.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants({
    rewrites: [
      {
        sectionId: "s0",
        rewrittenBody: "2026-04-28 incident; #162; 30KB threshold.",
        estimatedBytesSaved: 15,
      },
    ],
    sections,
    maxSavingsPct: 100,
  });
  assert.equal(warnings.length, 0);
});

test("findDroppedInvariants: flags excessive-savings when rewrite shrinks body more than max-savings-pct", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      // 100-byte body — easy to compute percentages.
      body: "x".repeat(100),
    },
  ]);
  const sections = parseClaudeMdSections(md);
  // Rewrite to 30 bytes — 70% reduction, exceeds 40% cap.
  const rewrites: SectionRewrite[] = [
    { sectionId: "s0", rewrittenBody: "x".repeat(30), estimatedBytesSaved: 70 },
  ];
  const warnings = findDroppedInvariants({
    rewrites,
    sections,
    maxSavingsPct: 40,
  });
  const savWarn = warnings.find((w) => w.kind === "excessive-savings");
  assert.ok(savWarn, "expected an excessive-savings warning");
  if (savWarn?.kind === "excessive-savings") {
    assert.equal(savWarn.savingsPct, 70);
    assert.equal(savWarn.maxSavingsPct, 40);
  }
});

test("findDroppedInvariants: excessive-savings does not fire at exactly the cap", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body: "x".repeat(100),
    },
  ]);
  const sections = parseClaudeMdSections(md);
  // Rewrite to 60 bytes — exactly 40% reduction, at the cap.
  const rewrites: SectionRewrite[] = [
    { sectionId: "s0", rewrittenBody: "x".repeat(60), estimatedBytesSaved: 40 },
  ];
  const warnings = findDroppedInvariants({
    rewrites,
    sections,
    maxSavingsPct: 40,
  });
  assert.equal(warnings.find((w) => w.kind === "excessive-savings"), undefined);
});

test("findDroppedInvariants: ignores zero-byte source bodies (no division by zero)", () => {
  const sections: ParsedSection[] = [
    {
      sectionId: "s0",
      runId: "run-A",
      issueId: 100,
      outcome: "implement",
      heading: "h",
      body: "",
    },
  ];
  const warnings = findDroppedInvariants({
    rewrites: [
      { sectionId: "s0", rewrittenBody: "tiny", estimatedBytesSaved: 0 },
    ],
    sections,
    maxSavingsPct: 40,
  });
  assert.equal(warnings.length, 0);
});

test("findDroppedInvariants: composes multiple warnings on the same rewrite", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body:
        "Past incident 2026-04-28; see #162; 30KB threshold; 50 turns budget. " +
        "x".repeat(200), // pad to 200+ bytes so reductions trip both invariants AND cap
    },
  ]);
  const sections = parseClaudeMdSections(md);
  // Drop #162, drop 50 turns, AND >40% reduction.
  const rewrites: SectionRewrite[] = [
    {
      sectionId: "s0",
      rewrittenBody: "2026-04-28; 30KB.",
      estimatedBytesSaved: 200,
    },
  ];
  const warnings = findDroppedInvariants({
    rewrites,
    sections,
    maxSavingsPct: 40,
  });
  const kinds = warnings.map((w) => w.kind).sort();
  assert.deepEqual(kinds, [
    "dropped-cross-reference",
    "dropped-numeric-threshold",
    "excessive-savings",
  ]);
});

test("clampRewriteFields: trims rewrittenBody past BODY_MAX", () => {
  const huge = "y".repeat(8000);
  const out = clampRewriteFields({
    rewrites: [{ sectionId: "s0", rewrittenBody: huge }],
    unchangedSectionIds: [],
  }) as { rewrites: Array<{ rewrittenBody: string }> };
  assert.ok(out.rewrites[0].rewrittenBody.length <= 6000);
  assert.match(out.rewrites[0].rewrittenBody, /\[…truncated\]$/);
});

test("clampRewriteFields: trims notes past 500-char cap", () => {
  const longNotes = "n".repeat(900);
  const out = clampRewriteFields({
    rewrites: [],
    unchangedSectionIds: [],
    notes: longNotes,
  }) as { notes: string };
  assert.ok(out.notes.length <= 500);
  assert.match(out.notes, /\[…truncated\]$/);
});

test("clampRewriteFields: leaves short notes / short body untouched", () => {
  const out = clampRewriteFields({
    rewrites: [{ sectionId: "s0", rewrittenBody: "short body" }],
    unchangedSectionIds: [],
    notes: "short note",
  }) as {
    rewrites: Array<{ rewrittenBody: string }>;
    notes: string;
  };
  assert.equal(out.rewrites[0].rewrittenBody, "short body");
  assert.equal(out.notes, "short note");
});

test("formatTightenProposal: zero-rewrite proposal renders the no-op note", () => {
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [],
    unchangedSectionIds: ["s0", "s1"],
    estimatedBytesSaved: 0,
    inputBytes: 4096,
    sectionCount: 2,
    notes: "All sections already tight; no rewrite proposed.",
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  const out = formatTightenProposal(proposal);
  assert.match(out, /Tighten proposal for agent-test/);
  assert.match(out, /no rewrites proposed/);
  assert.match(out, /All sections already tight/);
});

test("formatTightenProposal: surfaces all four warning kinds inline per rewrite", () => {
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "tight", estimatedBytesSaved: 200 },
    ],
    unchangedSectionIds: ["s1"],
    estimatedBytesSaved: 200,
    inputBytes: 8192,
    sectionCount: 2,
    warnings: [
      {
        kind: "dropped-incident-date",
        sectionId: "s0",
        missingDates: ["2026-04-28"],
      },
      {
        kind: "dropped-cross-reference",
        sectionId: "s0",
        missingRefs: ["#162"],
      },
      {
        kind: "dropped-numeric-threshold",
        sectionId: "s0",
        missingNumerics: ["50turns"],
      },
      {
        kind: "excessive-savings",
        sectionId: "s0",
        savingsPct: 70,
        maxSavingsPct: 40,
      },
    ],
    maxSavingsPct: 40,
  };
  const out = formatTightenProposal(proposal);
  assert.match(out, /DROPPED DATES: 2026-04-28/);
  assert.match(out, /DROPPED REFS: #162/);
  assert.match(out, /DROPPED NUMERICS: 50turns/);
  assert.match(out, /EXCESSIVE SAVINGS: 70% > 40%/);
  assert.match(out, /4 validator finding\(s\)/);
});

test("formatTightenProposal: clean proposal points at the --apply path tracker", () => {
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "tight", estimatedBytesSaved: 100 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 100,
    inputBytes: 4096,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  const out = formatTightenProposal(proposal);
  assert.match(out, /No validator warnings/);
  assert.match(out, /#173/);
});

test("DEFAULT_MAX_SAVINGS_PCT: documented default is 40 (per issue #172)", () => {
  assert.equal(DEFAULT_MAX_SAVINGS_PCT, 40);
});

test("MIN_DIFF_SAVINGS_BYTES: documented default is 50 (per issue #176)", () => {
  assert.equal(MIN_DIFF_SAVINGS_BYTES, 50);
});

test("DEFAULT_MAX_DIFF_LINES: documented default is 60 (per issue #176)", () => {
  assert.equal(DEFAULT_MAX_DIFF_LINES, 60);
});

test("lineDiff: identical inputs yield only eq ops", () => {
  const ops = lineDiff(["a", "b", "c"], ["a", "b", "c"]);
  assert.deepEqual(
    ops.map((o) => o.kind),
    ["eq", "eq", "eq"],
  );
});

test("lineDiff: pure replacement yields del+add ops", () => {
  const ops = lineDiff(["old"], ["new"]);
  assert.deepEqual(
    ops.map((o) => `${o.kind}:${o.line}`).sort(),
    ["add:new", "del:old"],
  );
});

test("lineDiff: detects common context line between two changes", () => {
  const ops = lineDiff(
    ["context", "removed-line", "context2"],
    ["context", "added-line", "context2"],
  );
  // Expected order from LCS walk: context (eq), removed (del),
  // added (add), context2 (eq) — and the eq lines must surface as eq.
  assert.equal(ops.filter((o) => o.kind === "eq").length, 2);
  assert.ok(ops.some((o) => o.kind === "del" && o.line === "removed-line"));
  assert.ok(ops.some((o) => o.kind === "add" && o.line === "added-line"));
});

test("formatRewriteDiff: emits unified-diff headers and prefixed body lines", () => {
  const out = formatRewriteDiff({
    sectionId: "s0",
    sourceBody: "alpha\nbeta\ngamma",
    rewrittenBody: "alpha\ndelta\ngamma",
  });
  const lines = out.split("\n");
  assert.equal(lines[0], "--- s0 (source)");
  assert.equal(lines[1], "+++ s0 (rewrite)");
  assert.equal(lines[2], "@@ -1,3 +1,3 @@");
  // alpha/gamma are common context (two-space prefix); beta→delta are -/+.
  assert.ok(out.includes("  alpha"));
  assert.ok(out.includes("- beta"));
  assert.ok(out.includes("+ delta"));
  assert.ok(out.includes("  gamma"));
});

test("formatRewriteDiff: caps body at maxLines and appends truncation marker", () => {
  // Build a 100-line "all replaced" diff: every line differs, so 200 ops.
  const src = Array.from({ length: 100 }, (_, i) => `src-line-${i}`).join("\n");
  const dst = Array.from({ length: 100 }, (_, i) => `dst-line-${i}`).join("\n");
  const out = formatRewriteDiff({
    sectionId: "s0",
    sourceBody: src,
    rewrittenBody: dst,
    maxLines: 10,
  });
  const lines = out.split("\n");
  // 3 header lines + 10 body lines + 1 truncation marker = 14.
  assert.equal(lines.length, 3 + 10 + 1);
  assert.match(lines[lines.length - 1], /^… \(\d+ more lines truncated\)$/);
});

test("formatTightenProposal: emits inline diff for rewrite ≥ 50 bytes when sources provided", () => {
  const sourceBody =
    "Past incident 2026-04-28: thing happened in elaborate detail.\n" +
    "More background that the rewrite trims.\n" +
    "Final point #162 preserved.";
  const rewrittenBody =
    "Past incident 2026-04-28: thing happened.\nFinal point #162 preserved.";
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      {
        sectionId: "s0",
        rewrittenBody,
        estimatedBytesSaved:
          Buffer.byteLength(sourceBody, "utf-8") -
          Buffer.byteLength(rewrittenBody, "utf-8"),
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 60,
    inputBytes: 4096,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  const sources = new Map([["s0", sourceBody]]);
  const out = formatTightenProposal(proposal, { sources });
  assert.match(out, /diff:/);
  assert.match(out, /--- s0 \(source\)/);
  assert.match(out, /\+\+\+ s0 \(rewrite\)/);
});

test("formatTightenProposal: omits diff for sub-50-byte savings (low signal)", () => {
  const sourceBody = "Tiny rewrite. Drop one filler.";
  const rewrittenBody = "Tiny rewrite.";
  const saved =
    Buffer.byteLength(sourceBody, "utf-8") -
    Buffer.byteLength(rewrittenBody, "utf-8");
  assert.ok(saved < MIN_DIFF_SAVINGS_BYTES, "fixture must be sub-50B");
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      {
        sectionId: "s0",
        rewrittenBody,
        estimatedBytesSaved: saved,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: saved,
    inputBytes: 1024,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  const sources = new Map([["s0", sourceBody]]);
  const out = formatTightenProposal(proposal, { sources });
  // No diff block should appear; the savings-only summary stays.
  assert.doesNotMatch(out, /diff:/);
  assert.doesNotMatch(out, /--- s0 \(source\)/);
  assert.match(out, /\[s0\]/);
});

test("formatTightenProposal: --no-diff (showDiffs:false) suppresses diffs even for big rewrites", () => {
  const sourceBody = "x".repeat(1000);
  const rewrittenBody = "y".repeat(500);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody, estimatedBytesSaved: 500 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 500,
    inputBytes: 4096,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: 100,
  };
  const sources = new Map([["s0", sourceBody]]);
  const out = formatTightenProposal(proposal, { showDiffs: false, sources });
  assert.doesNotMatch(out, /diff:/);
  assert.doesNotMatch(out, /--- s0 \(source\)/);
});

test("formatTightenProposal: gracefully omits diff when sources lack the sectionId", () => {
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "tight", estimatedBytesSaved: 200 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 200,
    inputBytes: 4096,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  // showDiffs default true, but sources empty: formatter must NOT throw
  // and must still render the savings-only line.
  const out = formatTightenProposal(proposal, { sources: new Map() });
  assert.doesNotMatch(out, /diff:/);
  assert.match(out, /\[s0\] 0\.20KB saved/);
});

test("formatTightenProposal: omits diff entirely when no opts arg provided (back-compat)", () => {
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "tight", estimatedBytesSaved: 200 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 200,
    inputBytes: 4096,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  // Legacy single-arg call (existing tests + JSON path) must keep working
  // and produce no diff (no sources to diff against).
  const out = formatTightenProposal(proposal);
  assert.doesNotMatch(out, /diff:/);
  assert.match(out, /\[s0\] 0\.20KB saved/);
});

// ---------------------------------------------------------------------------
// Phase B0 (issue #173) tests: STUDY_PENDING const, the offset-aware parser,
// the body-only splicer, and the applyTighten mechanism (drift rejections +
// hard-reject validator + sentinel-preserving rewrite under the file lock).
// applyTighten is exercised end-to-end against a tmp agents-root, mirroring
// the compact test harness (write the file at the path AGENTS_ROOT already
// points to; agents/ is gitignored, so it's safe).
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  STUDY_PENDING,
  applyTighten,
  parseClaudeMdSectionsWithOffsets,
  spliceTightenedSections,
} from "./tightenClaudeMd.js";
import { computeTightenHash } from "../state/tightenConfirm.js";
import { agentClaudeMdPath } from "./specialization.js";

function fakeMdContent(
  sections: Array<{ run: string; issue: number; heading: string; body: string }>,
): string {
  // Match the on-disk shape `appendBlock` produces: one `\n` separating
  // blocks, no leading whitespace before the first sentinel.
  return (
    sections
      .map(
        (s) =>
          `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}`,
      )
      .join("\n") + "\n"
  );
}

async function withTempAgentDir(
  fn: (agentId: string, filePath: string) => Promise<void>,
): Promise<void> {
  const agentId = `test-tighten-${Math.random().toString(16).slice(2, 10)}`;
  const filePath = agentClaudeMdPath(agentId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fn(agentId, filePath);
  } finally {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true }).catch(() => {});
  }
}

function proposalOf(rewrites: SectionRewrite[]): TightenProposal {
  return {
    agentId: "agent-test",
    rewrites,
    unchangedSectionIds: [],
    estimatedBytesSaved: rewrites.reduce((a, r) => a + r.estimatedBytesSaved, 0),
    inputBytes: 0,
    sectionCount: rewrites.length,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
}

test("STUDY_PENDING: default-true const gates the destructive trigger (#173 Phase B0)", () => {
  // Documents the shipped default. The mechanism stays implemented + tested
  // below regardless; only the CLI predicate is gated. Flipping this to
  // false post-corpus opens the path with zero further code.
  assert.equal(STUDY_PENDING, true);
});

test("parseClaudeMdSectionsWithOffsets: body offsets slice exactly the trimmed body", () => {
  const md = fakeMdContent([
    { run: "r-a", issue: 100, heading: "Rule A", body: "Body A, #162, 30KB." },
    { run: "r-b", issue: 101, heading: "Rule B", body: "Body B, 2026-05-05." },
  ]);
  const secs = parseClaudeMdSectionsWithOffsets(md);
  assert.equal(secs.length, 2);
  for (const s of secs) {
    assert.equal(md.slice(s.bodyStart, s.bodyEnd), s.body);
    // Sentinel header sits inside [fileStart, bodyStart) and is preserved.
    assert.match(md.slice(s.fileStart, s.bodyStart), /<!-- run:/);
    assert.match(md.slice(s.fileStart, s.bodyStart), /## Rule [AB]/);
  }
  // The two sectionIds match parseClaudeMdSections numbering.
  assert.deepEqual(
    secs.map((s) => s.sectionId),
    ["s0", "s1"],
  );
});

test("spliceTightenedSections: substitutes only the body bytes, preserves sentinel verbatim", () => {
  const md = fakeMdContent([
    { run: "r-a", issue: 100, heading: "Rule A", body: "Verbose body A. #162. 30KB. 2026-05-05." },
    { run: "r-b", issue: 101, heading: "Rule B", body: "Verbose body B." },
  ]);
  const secs = parseClaudeMdSectionsWithOffsets(md);
  const out = spliceTightenedSections({
    currentFile: md,
    sections: secs,
    rewrites: [
      { sectionId: "s0", rewrittenBody: "Tight A. #162. 30KB. 2026-05-05.", estimatedBytesSaved: 8 },
    ],
  });
  // Sentinel headers untouched.
  assert.match(out, /<!-- run:r-a issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->/);
  assert.match(out, /<!-- run:r-b issue:#101 outcome:implement ts:2026-05-05T12:00:00.000Z -->/);
  // s0 body replaced; s1 body verbatim.
  assert.match(out, /Tight A\. #162\. 30KB\. 2026-05-05\./);
  assert.doesNotMatch(out, /Verbose body A\./);
  assert.match(out, /Verbose body B\./);
  // Re-parses cleanly into 2 sections with identical provenance.
  const reparsed = parseClaudeMdSections(out);
  assert.equal(reparsed.length, 2);
  assert.equal(reparsed[0].runId, "r-a");
  assert.equal(reparsed[0].issueId, 100);
  assert.equal(reparsed[0].body, "Tight A. #162. 30KB. 2026-05-05.");
  assert.equal(reparsed[1].body, "Verbose body B.");
});

test("applyTighten: rewrites file under lock, preserves sentinel, returns applied", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "Verbose body. #162. 30KB. 2026-05-05." },
      { run: "r-b", issue: 101, heading: "Rule B", body: "Untouched body B." },
    ]);
    await fs.writeFile(filePath, md);

    const rewrites: SectionRewrite[] = [
      { sectionId: "s0", rewrittenBody: "Tight. #162. 30KB. 2026-05-05.", estimatedBytesSaved: 8 },
    ];
    const proposal = proposalOf(rewrites);
    const expectedHash = computeTightenHash(rewrites, md);
    const result = await applyTighten({
      agentId,
      proposal,
      expectedTightenHash: expectedHash,
      computeTightenHash,
    });
    assert.equal(result.kind, "applied");
    if (result.kind !== "applied") return;
    assert.equal(result.rewritesApplied, 1);
    assert.ok(result.bytesAfter < result.bytesBefore);

    const after = await fs.readFile(filePath, "utf-8");
    // Sentinel header preserved verbatim — provenance unchanged, no new
    // merged sentinel minted.
    assert.match(after, /<!-- run:r-a issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->/);
    const reparsed = parseClaudeMdSections(after);
    assert.equal(reparsed.length, 2);
    assert.equal(reparsed[0].outcome, "implement");
    assert.equal(reparsed[0].body, "Tight. #162. 30KB. 2026-05-05.");
    assert.equal(reparsed[1].body, "Untouched body B.");
  });
});

test("applyTighten: rejects with tighten-hash drift when file changed between plan and confirm", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const planMd = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "Verbose body. #162. 30KB." },
    ]);
    await fs.writeFile(filePath, planMd);

    const rewrites: SectionRewrite[] = [
      { sectionId: "s0", rewrittenBody: "Tight. #162. 30KB.", estimatedBytesSaved: 8 },
    ];
    const planHash = computeTightenHash(rewrites, planMd);

    // File drifts after planning.
    const driftMd = planMd + "\n<!-- run:r-b issue:#101 outcome:implement ts:2026-05-06T00:00:00.000Z -->\n## Rule B\n\nNew.\n";
    await fs.writeFile(filePath, driftMd);

    const result = await applyTighten({
      agentId,
      proposal: proposalOf(rewrites),
      expectedTightenHash: planHash,
      computeTightenHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "tighten-hash");
    // File untouched on rejection.
    assert.equal(await fs.readFile(filePath, "utf-8"), driftMd);
  });
});

test("applyTighten: rejects when a rewrite drops a date (hard-reject validator)", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "Past incident 2026-05-05: thing." },
    ]);
    await fs.writeFile(filePath, md);
    const rewrites: SectionRewrite[] = [
      // Drops the 2026-05-05 date.
      { sectionId: "s0", rewrittenBody: "Past incident: thing.", estimatedBytesSaved: 10 },
    ];
    const result = await applyTighten({
      agentId,
      proposal: proposalOf(rewrites),
      expectedTightenHash: computeTightenHash(rewrites, md),
      computeTightenHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "warnings-present");
    assert.match(result.details, /dropped dates 2026-05-05/);
    assert.equal(await fs.readFile(filePath, "utf-8"), md, "file untouched on reject");
  });
});

test("applyTighten: rejects when a rewrite drops a cross-reference", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "See #162 for the prior fix." },
    ]);
    await fs.writeFile(filePath, md);
    const rewrites: SectionRewrite[] = [
      { sectionId: "s0", rewrittenBody: "See the prior fix.", estimatedBytesSaved: 6 },
    ];
    const result = await applyTighten({
      agentId,
      proposal: proposalOf(rewrites),
      expectedTightenHash: computeTightenHash(rewrites, md),
      computeTightenHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "warnings-present");
    assert.match(result.details, /dropped refs #162/);
  });
});

test("applyTighten: rejects when a rewrite drops a numeric threshold", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "Cap CLAUDE.md at 30KB before splitting." },
    ]);
    await fs.writeFile(filePath, md);
    const rewrites: SectionRewrite[] = [
      { sectionId: "s0", rewrittenBody: "Cap CLAUDE.md before splitting.", estimatedBytesSaved: 5 },
    ];
    const result = await applyTighten({
      agentId,
      proposal: proposalOf(rewrites),
      expectedTightenHash: computeTightenHash(rewrites, md),
      computeTightenHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "warnings-present");
    assert.match(result.details, /dropped numerics 30kb/);
  });
});

test("applyTighten: excessive-savings (advisory) is NOT a hard reject", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    // Body has no invariants to drop; the rewrite shrinks it >40% (the
    // soft cap), producing an excessive-savings warning that must NOT block
    // apply — only date/xref/numeric drops do.
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "This is a fairly long verbose body with much filler prose to cut." },
    ]);
    await fs.writeFile(filePath, md);
    const rewrites: SectionRewrite[] = [
      { sectionId: "s0", rewrittenBody: "Short.", estimatedBytesSaved: 56 },
    ];
    const result = await applyTighten({
      agentId,
      proposal: proposalOf(rewrites),
      expectedTightenHash: computeTightenHash(rewrites, md),
      computeTightenHash,
    });
    assert.equal(result.kind, "applied", "excessive-savings is advisory; apply proceeds");
  });
});

test("applyTighten: empty rewrites -> no-rewrites rejection (no file touch)", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "Body." },
    ]);
    await fs.writeFile(filePath, md);
    const result = await applyTighten({
      agentId,
      proposal: proposalOf([]),
      expectedTightenHash: "deadbeef",
      computeTightenHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "no-rewrites");
    assert.equal(await fs.readFile(filePath, "utf-8"), md);
  });
});

test("applyTighten: rejects when a rewrite references a sectionId not in the live parse", async () => {
  await withTempAgentDir(async (agentId, filePath) => {
    const md = fakeMdContent([
      { run: "r-a", issue: 100, heading: "Rule A", body: "Body A." },
    ]);
    await fs.writeFile(filePath, md);
    const rewrites: SectionRewrite[] = [
      { sectionId: "s5", rewrittenBody: "Tight.", estimatedBytesSaved: 2 },
    ];
    const result = await applyTighten({
      agentId,
      proposal: proposalOf(rewrites),
      expectedTightenHash: computeTightenHash(rewrites, md),
      computeTightenHash,
    });
    assert.equal(result.kind, "drift-rejected");
    if (result.kind !== "drift-rejected") return;
    assert.equal(result.reason, "missing-section");
  });
});

// ---------------------------------------------------------------------------
// STUDY_PENDING CLI gate (#173 Phase B0). Spawns the built CLI against a
// throwaway cwd (registry + agent CLAUDE.md fixture) so the full handler —
// including its process.exit refusal — is exercised. dist/bin/vp-dev.js
// exists because `npm test` runs `tsc` before node --test. Both --apply and
// --confirm must refuse + mutate nothing while STUDY_PENDING is true.
// ---------------------------------------------------------------------------

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFile = promisify(execFileCb);

// dist/bin/vp-dev.js relative to this compiled test (dist/src/agent/*.js).
const CLI_JS = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../bin/vp-dev.js",
);

async function withCliFixture(
  fn: (dir: string, agentId: string) => Promise<void>,
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-cli-"));
  const agentId = "agent-cli";
  await fs.mkdir(path.join(dir, "state"), { recursive: true });
  await fs.mkdir(path.join(dir, "agents", agentId), { recursive: true });
  const now = new Date().toISOString();
  const registry = {
    agents: [
      {
        agentId,
        createdAt: now,
        tags: ["t"],
        issuesHandled: 1,
        implementCount: 1,
        pushbackCount: 0,
        errorCount: 0,
        lastActiveAt: now,
      },
    ],
  };
  await fs.writeFile(
    path.join(dir, "state", "agents-registry.json"),
    JSON.stringify(registry),
  );
  // Sectionless CLAUDE.md: no `<!-- run: -->` sentinels means proposeTighten
  // short-circuits (`sections.length === 0`) with zero LLM calls, so the
  // STUDY_PENDING --apply gate test stays deterministic + offline.
  await fs.writeFile(
    path.join(dir, "agents", agentId, "CLAUDE.md"),
    "# Seed CLAUDE.md\n\nNo attributable sections — proposeTighten short-circuits.\n",
  );
  try {
    await fn(dir, agentId);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

type ExecErr = Error & { code?: number; stdout?: string; stderr?: string };

// The handler prints a `Generating tighten proposal...` preamble to stdout
// before the JSON object; extract the JSON starting at the first `{`.
function parseJsonTail(stdout: string): unknown {
  const i = stdout.indexOf("{");
  assert.ok(i >= 0, `expected a JSON object in stdout: ${stdout}`);
  return JSON.parse(stdout.slice(i));
}

test("STUDY_PENDING CLI gate: --apply refuses, exits 2, mints no token", async () => {
  await withCliFixture(async (dir, agentId) => {
    let err: ExecErr | undefined;
    let stdout = "";
    try {
      const r = await execFile(
        process.execPath,
        [CLI_JS, "agents", "tighten-claude-md", agentId, "--apply", "--json"],
        { cwd: dir },
      );
      stdout = r.stdout;
    } catch (e) {
      err = e as ExecErr;
      stdout = err.stdout ?? "";
    }
    // Non-zero exit (process.exit(2)).
    assert.ok(err, "--apply must exit non-zero while STUDY_PENDING");
    assert.equal(err?.code, 2);
    // JSON refusal marker.
    const parsed = parseJsonTail(stdout) as { applyRefused?: string };
    assert.equal(parsed.applyRefused, "study-pending");
    // No token file minted.
    const stateFiles = await fs.readdir(path.join(dir, "state"));
    assert.ok(
      !stateFiles.some((f) => f.startsWith("tighten-confirm-")),
      `no tighten-confirm token should be minted; found: ${stateFiles.join(",")}`,
    );
  });
});

test("STUDY_PENDING CLI gate: --confirm refuses, exits 2, mutates nothing (hand-crafted token)", async () => {
  await withCliFixture(async (dir, agentId) => {
    const mdPath = path.join(dir, "agents", agentId, "CLAUDE.md");
    const before = await fs.readFile(mdPath, "utf-8");
    let err: ExecErr | undefined;
    let stdout = "";
    try {
      const r = await execFile(
        process.execPath,
        [CLI_JS, "agents", "tighten-claude-md", agentId, "--confirm", "deadbeefcafe", "--json"],
        { cwd: dir },
      );
      stdout = r.stdout;
    } catch (e) {
      err = e as ExecErr;
      stdout = err.stdout ?? "";
    }
    assert.ok(err, "--confirm must exit non-zero while STUDY_PENDING");
    assert.equal(err?.code, 2);
    const parsed = parseJsonTail(stdout) as { confirmRefused?: string };
    assert.equal(parsed.confirmRefused, "study-pending");
    // File untouched — defense in depth: a hand-crafted token must not
    // trigger a mutation while the gate is closed.
    assert.equal(await fs.readFile(mdPath, "utf-8"), before);
  });
});

test("tighten CLI: --apply and --confirm are mutually exclusive", async () => {
  await withCliFixture(async (dir, agentId) => {
    let err: ExecErr | undefined;
    try {
      await execFile(
        process.execPath,
        [CLI_JS, "agents", "tighten-claude-md", agentId, "--apply", "--confirm", "abc123"],
        { cwd: dir },
      );
    } catch (e) {
      err = e as ExecErr;
    }
    assert.ok(err);
    assert.equal(err?.code, 2);
    assert.match(err?.stderr ?? "", /mutually exclusive/);
  });
});
