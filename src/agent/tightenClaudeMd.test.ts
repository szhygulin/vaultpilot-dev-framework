// Phase A (issue #172) + Phase B (issue #173) tests.
//
// Phase A tests: invariant-extraction matchers, the dropped-invariant validator
// (each warning kind), savings-cap warning, schema clamp, and the dry-run
// formatter shape.
//
// Phase B tests: applyTighten apply-path — drift rejection (file changed between
// apply and confirm → hash mismatch rejects), lock contention, validator firing
// on dropped-date/xref/numeric, splice preserves sentinel verbatim, zero-rewrites
// refusal, expired/missing/malformed token handling.
//
// No LLM is called — proposeTighten is exercised end-to-end only indirectly via
// its pure helpers, since the live network/SDK call is the expensive part.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_MAX_DIFF_LINES,
  DEFAULT_MAX_SAVINGS_PCT,
  MIN_DIFF_SAVINGS_BYTES,
  applyTighten,
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
import {
  computeTightenHash,
} from "../state/tightenConfirm.js";

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

test("formatTightenProposal: clean proposal points at the --apply/--confirm path", () => {
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
  assert.match(out, /--apply/);
  assert.match(out, /--confirm/);
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
// Phase B (issue #173): applyTighten apply-path tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal CLAUDE.md with one section whose body is `body`.
 * Returns the raw string and the sentinel line verbatim.
 */
function makeOneSectionMd(opts: {
  run?: string;
  issue?: number;
  outcome?: string;
  ts?: string;
  heading?: string;
  body: string;
}): { md: string; sentinel: string } {
  const run = opts.run ?? "run-test";
  const issue = opts.issue ?? 100;
  const outcome = opts.outcome ?? "implement";
  const ts = opts.ts ?? "2026-05-05T12:00:00.000Z";
  const heading = opts.heading ?? "Rule A";
  const sentinel = `<!-- run:${run} issue:#${issue} outcome:${outcome} ts:${ts} -->`;
  const md = `${sentinel}\n## ${heading}\n\n${opts.body}\n`;
  return { md, sentinel };
}

/** Build a TightenProposal for a single-section file. */
function makeProposal(opts: {
  agentId?: string;
  sectionId?: string;
  rewrittenBody: string;
  estimatedBytesSaved?: number;
  warnings?: TightenProposal["warnings"];
  /** Override maxSavingsPct — defaults to 100 for apply-path tests to avoid
   *  triggering the excessive-savings validator on synthetic small fixtures. */
  maxSavingsPct?: number;
}): TightenProposal {
  const estimatedBytesSaved = opts.estimatedBytesSaved ?? 10;
  return {
    agentId: opts.agentId ?? "agent-test",
    rewrites: [
      {
        sectionId: opts.sectionId ?? "s0",
        rewrittenBody: opts.rewrittenBody,
        estimatedBytesSaved,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved,
    inputBytes: 1000,
    sectionCount: 1,
    warnings: opts.warnings ?? [],
    maxSavingsPct: opts.maxSavingsPct ?? 100,
  };
}

test("applyTighten: splice preserves sentinel header verbatim — only body bytes change", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md, sentinel } = makeOneSectionMd({
    run: "run-42",
    issue: 100,
    outcome: "implement",
    ts: "2026-05-05T12:00:00.000Z",
    heading: "Verbose Rule",
    body: "This is a very verbose body with lots of words that can be shortened. Past incident 2026-04-28.",
  });
  await fs.writeFile(filePath, md);

  const proposal = makeProposal({
    rewrittenBody: "Tighter. Past incident 2026-04-28.",
    estimatedBytesSaved: 50,
  });
  const tightenHash = computeTightenHash(proposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "applied");
  if (result.kind !== "applied") return;

  const written = await fs.readFile(filePath, "utf-8");
  // Sentinel must appear verbatim in the output.
  assert.ok(
    written.includes(sentinel),
    `sentinel must be preserved verbatim; written:\n${written}`,
  );
  // Heading must be preserved.
  assert.ok(written.includes("## Verbose Rule"), "heading must be preserved");
  // New body must appear.
  assert.ok(
    written.includes("Tighter. Past incident 2026-04-28."),
    "rewritten body must appear",
  );
  // Old verbose body must be gone.
  assert.ok(
    !written.includes("lots of words that can be shortened"),
    "old body must be replaced",
  );
  assert.ok(result.bytesAfter < result.bytesBefore, "file must shrink");
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: drift rejection — file changed between --apply and --confirm", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md } = makeOneSectionMd({
    body: "Original body text. Past incident 2026-04-28.",
  });
  await fs.writeFile(filePath, md);

  const proposal = makeProposal({
    rewrittenBody: "Tighter. Past incident 2026-04-28.",
    estimatedBytesSaved: 20,
  });
  // Hash computed against the original md.
  const tightenHash = computeTightenHash(proposal, md);

  // Now mutate the file (simulates the operator editing between --apply and --confirm).
  const driftedMd = md + "\n<!-- run:run-999 issue:#999 outcome:implement ts:2026-06-01T00:00:00.000Z -->\n## Extra\n\nExtra section added.\n";
  await fs.writeFile(filePath, driftedMd);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "proposal-hash");
  assert.match(result.details, /changed between/);
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: rejects when a sectionId in the proposal no longer exists (file drift)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md } = makeOneSectionMd({
    body: "Body text. Past incident 2026-04-28.",
  });
  await fs.writeFile(filePath, md);

  // Proposal references s1 which doesn't exist in a single-section file.
  const proposal = makeProposal({
    sectionId: "s1", // doesn't exist
    rewrittenBody: "Tighter. Past incident 2026-04-28.",
    estimatedBytesSaved: 20,
  });
  const tightenHash = computeTightenHash(proposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "missing-section");
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: rejects when validator fires at confirm time (dropped date)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md } = makeOneSectionMd({
    body: "Rule body. Past incident 2026-04-28.",
  });
  await fs.writeFile(filePath, md);

  // Rewrite drops the date — validator should reject.
  const proposal = makeProposal({
    rewrittenBody: "Rule body without date.",
    estimatedBytesSaved: 30,
  });
  const tightenHash = computeTightenHash(proposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "warnings-present");
  assert.match(result.details, /dropped-incident-date/i);
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: rejects when validator fires at confirm time (dropped xref)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md } = makeOneSectionMd({
    body: "See #162 for context. The rule is important.",
  });
  await fs.writeFile(filePath, md);

  // Rewrite drops #162.
  const proposal = makeProposal({
    rewrittenBody: "The rule is important.",
    estimatedBytesSaved: 25,
  });
  const tightenHash = computeTightenHash(proposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "warnings-present");
  assert.match(result.details, /dropped-cross-reference/i);
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: rejects when validator fires at confirm time (dropped numeric)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md } = makeOneSectionMd({
    body: "Use 30KB threshold and 15 min TTL always.",
  });
  await fs.writeFile(filePath, md);

  // Rewrite drops "15 min".
  const proposal = makeProposal({
    rewrittenBody: "Use 30KB threshold always.",
    estimatedBytesSaved: 20,
  });
  const tightenHash = computeTightenHash(proposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "warnings-present");
  assert.match(result.details, /dropped-numeric-threshold/i);
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: zero-rewrites proposal is rejected — nothing to apply", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  const { md } = makeOneSectionMd({ body: "Body." });
  await fs.writeFile(filePath, md);

  const emptyProposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [],
    unchangedSectionIds: ["s0"],
    estimatedBytesSaved: 0,
    inputBytes: 100,
    sectionCount: 1,
    warnings: [],
    maxSavingsPct: DEFAULT_MAX_SAVINGS_PCT,
  };
  const tightenHash = computeTightenHash(emptyProposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal: emptyProposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "no-rewrites");
  await fs.rm(dir, { recursive: true });
});

test("applyTighten: missing file returns drift-rejected with missing-file reason", async () => {
  const result = await applyTighten({
    agentId: "agent-test",
    proposal: makeProposal({ rewrittenBody: "tight" }),
    expectedTightenHash: "deadbeefdeadbeef",
    computeTightenHash,
    claudeMdPathOverride: "/tmp/does-not-exist-tighten-test/CLAUDE.md",
  });

  assert.equal(result.kind, "drift-rejected");
  if (result.kind !== "drift-rejected") return;
  assert.equal(result.reason, "missing-file");
});

test("applyTighten: applies clean multi-section file, only targeted section body changes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tighten-test-"));
  const filePath = path.join(dir, "CLAUDE.md");
  // Two-section file; only s0 gets a rewrite.
  const s0Sentinel = "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->";
  const s1Sentinel = "<!-- run:run-B issue:#101 outcome:implement ts:2026-05-05T13:00:00.000Z -->";
  const md =
    `${s0Sentinel}\n## Rule A\n\nVerbose rule A body that needs tightening.\n` +
    `${s1Sentinel}\n## Rule B\n\nVerbose rule B body untouched. See #162. 30KB.\n`;
  await fs.writeFile(filePath, md);

  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "Tight rule A.", estimatedBytesSaved: 30 },
    ],
    unchangedSectionIds: ["s1"],
    estimatedBytesSaved: 30,
    inputBytes: Buffer.byteLength(md, "utf-8"),
    sectionCount: 2,
    warnings: [],
    // 100% cap: synthetic fixture has high savings-pct; don't let the
    // excessive-savings validator block the apply-path test.
    maxSavingsPct: 100,
  };
  const tightenHash = computeTightenHash(proposal, md);

  const result = await applyTighten({
    agentId: "agent-test",
    proposal,
    expectedTightenHash: tightenHash,
    computeTightenHash,
    claudeMdPathOverride: filePath,
  });

  assert.equal(result.kind, "applied");
  if (result.kind !== "applied") return;
  assert.equal(result.sectionsRewritten, 1);

  const written = await fs.readFile(filePath, "utf-8");
  // s0 sentinel preserved verbatim.
  assert.ok(written.includes(s0Sentinel), "s0 sentinel must be preserved");
  // s1 sentinel preserved verbatim.
  assert.ok(written.includes(s1Sentinel), "s1 sentinel must be preserved");
  // s0 new body present.
  assert.ok(written.includes("Tight rule A."), "s0 rewritten body must appear");
  // s0 old body gone.
  assert.ok(!written.includes("Verbose rule A body"), "s0 old body must be gone");
  // s1 body untouched.
  assert.ok(written.includes("Verbose rule B body untouched."), "s1 body must be untouched");
  await fs.rm(dir, { recursive: true });
});
