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
