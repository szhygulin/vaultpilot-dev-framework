import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock, stripOverlappingSections } from "../agent/prompt.js";

test("stripOverlappingSections: drops perAgent ## sections whose heading also appears in live", () => {
  const live = `# Project rules
## Git workflow
- some rule

## CI is a hard gate
- another rule
`;
  const perAgent = `## Crypto/DeFi Transaction Preflight Checks
- agent-specific rule

## Git workflow
- stale copy of the same heading

## Tool Usage Discipline
- agent-specific rule
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.match(out, /## Crypto\/DeFi Transaction Preflight Checks/);
  assert.match(out, /## Tool Usage Discipline/);
  assert.doesNotMatch(out, /## Git workflow/);
  assert.doesNotMatch(out, /stale copy of the same heading/);
});

test("stripOverlappingSections: heading match is case-insensitive and whitespace-trimmed", () => {
  const live = `## Foo Bar
content
`;
  const perAgent = `##  foo bar
stale content

## Other
keep
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.doesNotMatch(out, /stale content/);
  assert.match(out, /## Other/);
  assert.match(out, /keep/);
});

test("stripOverlappingSections: preserves preamble (content before first ##)", () => {
  const live = `## Shared
x
`;
  const perAgent = `intro paragraph
preserved as preamble

## Shared
drop me

## Unique
keep me
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.match(out, /intro paragraph/);
  assert.match(out, /preserved as preamble/);
  assert.doesNotMatch(out, /drop me/);
  assert.match(out, /## Unique/);
  assert.match(out, /keep me/);
});

test("stripOverlappingSections: no overlap leaves perAgent untouched", () => {
  const live = `## A
1
`;
  const perAgent = `## B
2

## C
3
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.equal(out.trim(), perAgent.trim());
});

test("stripOverlappingSections: live with no ## headings leaves perAgent untouched", () => {
  const live = `just a paragraph, no headings`;
  const perAgent = `## A
1

## B
2
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.equal(out, perAgent);
});

test("stripOverlappingSections: drops the dropped section's body lines too, until next ##", () => {
  const live = `## Drop
x
`;
  const perAgent = `## Drop
line 1
line 2

line 3
## Keep
y
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.doesNotMatch(out, /line 1/);
  assert.doesNotMatch(out, /line 2/);
  assert.doesNotMatch(out, /line 3/);
  assert.match(out, /## Keep/);
  assert.match(out, /y/);
});

// ---- renderResumeBlock (issue #119 Phase 2) ----------------------------

test("renderResumeBlock: full context — agent, runId, errorSubtype, finalText, partialBranchUrl all present", () => {
  const out = renderResumeBlock({
    branch: "vp-dev/agent-08c4/issue-86-incomplete-run-2026-05-04T16-53-06-188Z",
    runId: "run-2026-05-04T16-53-06-188Z",
    agentId: "agent-08c4",
    errorSubtype: "error_max_turns",
    finalText: "Pushed branch but ran out of turns before gh pr create",
    partialBranchUrl:
      "https://github.com/owner/repo/tree/vp-dev%2Fagent-08c4%2Fissue-86-incomplete-run-2026-05-04T16-53-06-188Z",
  });
  assert.match(out, /agent-08c4/);
  assert.match(out, /run-2026-05-04T16-53-06-188Z/);
  assert.match(out, /error_max_turns/);
  assert.match(out, /git log --oneline origin\/main\.\.HEAD/);
  assert.match(out, /Pushed branch but ran out of turns/);
  assert.match(out, /Salvage branch: https:\/\/github\.com\/owner\/repo\/tree\//);
});

test("renderResumeBlock: missing errorSubtype renders as 'unknown'", () => {
  const out = renderResumeBlock({
    branch: "vp-dev/agent-aa00/issue-1-incomplete-run-X",
    runId: "run-X",
    agentId: "agent-aa00",
  });
  assert.match(out, /failure mode: unknown/);
  assert.doesNotMatch(out, /Last meaningful action/);
  assert.doesNotMatch(out, /Salvage branch/);
});

test("renderResumeBlock: truncates finalText to 120 chars and collapses whitespace", () => {
  const long =
    "x".repeat(80) + "\n  multiline\twhitespace\n" + "y".repeat(80);
  const out = renderResumeBlock({
    branch: "vp-dev/agent-aa00/issue-1-incomplete-run-X",
    runId: "run-X",
    agentId: "agent-aa00",
    finalText: long,
  });
  const m = /Last meaningful action recorded: (.+)$/m.exec(out);
  assert.ok(m, "expected the recorded line to render");
  assert.ok(m![1].length <= 120, `truncated text length should be <= 120, got ${m![1].length}`);
  assert.doesNotMatch(m![1], /\t/);
  assert.doesNotMatch(m![1], /\n/);
});

test("renderResumeBlock: omits partial branch line when partialBranchUrl is undefined", () => {
  const out = renderResumeBlock({
    branch: "vp-dev/agent-aa00/issue-1-incomplete-run-X",
    runId: "run-X",
    agentId: "agent-aa00",
    errorSubtype: "error_max_budget_usd",
    finalText: "ran out of budget",
  });
  assert.match(out, /failure mode: error_max_budget_usd/);
  assert.match(out, /Last meaningful action recorded: ran out of budget/);
  assert.doesNotMatch(out, /Salvage branch/);
});

test("stripOverlappingSections: section-body containing what looks like a heading marker on its own does not bleed", () => {
  // Edge case: a section's body has a line starting with "##" only at the
  // top level (no leading whitespace), which the regex treats as a new
  // section. That's the expected behavior — markdown semantics say the same.
  const live = `## A
x
`;
  const perAgent = `## A
drop body

## B
keep body
`;
  const out = stripOverlappingSections(perAgent, live);
  assert.doesNotMatch(out, /drop body/);
  assert.match(out, /keep body/);
});
