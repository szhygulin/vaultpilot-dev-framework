import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPreview } from "./previewDiff.js";

test("diffPreview: identical inputs produce empty diff", () => {
  const text = "line one\nline two\nline three";
  assert.equal(diffPreview(text, text), "");
});

test("diffPreview: single-line change is the only thing emitted (with one line of context on each side)", () => {
  // Models the issue #137 scenario: only the "Triage cost:" line drifts.
  const expected = [
    "Run setup",
    "  Authorized:     1 (--agents)",
    "  Triage cost:    ~$0.0241 (already incurred)",
    "  Dry run:        no",
    "Issues to address:",
  ].join("\n");
  const actual = [
    "Run setup",
    "  Authorized:     1 (--agents)",
    "  Triage cost:    ~$0.0000 (already incurred)",
    "  Dry run:        no",
    "Issues to address:",
  ].join("\n");
  const diff = diffPreview(expected, actual);
  // The drifted line MUST appear, prefixed with `- ` and `+ `.
  assert.ok(
    diff.includes("- ") && diff.includes("$0.0241"),
    `diff missing del line: ${diff}`,
  );
  assert.ok(
    diff.includes("+ ") && diff.includes("$0.0000"),
    `diff missing add line: ${diff}`,
  );
  // Adjacent context lines should be present so the change is anchored.
  assert.ok(diff.includes("Authorized"), `missing context above: ${diff}`);
  assert.ok(diff.includes("Dry run"), `missing context below: ${diff}`);
  // Lines that didn't change AND aren't adjacent to a change should NOT be
  // emitted — keeps the output focused on the actual drift.
  assert.ok(!diff.includes("Run setup"), `unrelated context leaked: ${diff}`);
  assert.ok(!diff.includes("Issues to address"), `unrelated context leaked: ${diff}`);
});

test("diffPreview: pure addition (one new line appended)", () => {
  const expected = "a\nb";
  const actual = "a\nb\nc";
  const diff = diffPreview(expected, actual);
  // Only the added line + its preceding context line should appear.
  assert.ok(diff.includes("+ c"), `expected '+ c' in diff, got: ${diff}`);
});

test("diffPreview: pure deletion (one line removed)", () => {
  const expected = "a\nb\nc";
  const actual = "a\nc";
  const diff = diffPreview(expected, actual);
  assert.ok(diff.includes("- b"), `expected '- b' in diff, got: ${diff}`);
});

test("diffPreview: respects maxLines cap and emits truncation marker", () => {
  // Construct a wide diff: 100 lines, all different.
  const expected = Array.from({ length: 100 }, (_, i) => `e${i}`).join("\n");
  const actual = Array.from({ length: 100 }, (_, i) => `a${i}`).join("\n");
  const diff = diffPreview(expected, actual, { maxLines: 10 });
  const lines = diff.split("\n");
  // 10 emitted change/context lines + 1 truncation marker.
  assert.ok(lines.length <= 11, `cap violated: ${lines.length} lines`);
  assert.ok(
    lines[lines.length - 1].startsWith("... ("),
    `missing truncation marker: ${lines[lines.length - 1]}`,
  );
});
