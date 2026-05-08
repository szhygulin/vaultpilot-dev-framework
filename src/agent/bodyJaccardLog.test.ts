// Phase A instrumentation tests (#239 / #201). Asserts the JSONL line shape
// emitted per pending candidate, plus the documented zero-shape on empty
// CLAUDE.md per CLAUDE.md "smoke-test the empty-result path before merging".

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  BODY_JACCARD_LOG_PATH,
  appendBodyJaccardLogLine,
  computeBodyJaccardScore,
  loadComparandClaudeMd,
  type BodyJaccardLogLine,
} from "./bodyJaccardLog.js";

let counter = 0;
async function withTempLogPath<T>(
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bjlog-"));
  const filePath = path.join(dir, `log-${++counter}.jsonl`);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const SECTION_FIXTURE = [
  "<!-- run:run-A issue:#10 outcome:implement ts:2026-05-01T00:00:00Z -->",
  "## First lesson",
  "",
  "completely different topic about apples bananas cherries oranges",
  "",
  "<!-- run:run-B issue:#11 outcome:implement ts:2026-05-02T00:00:00Z -->",
  "## Second lesson",
  "",
  "shared lesson body about typed-data signing for ledger devices",
  "",
  "<!-- run:run-C issue:#12 outcome:implement ts:2026-05-03T00:00:00Z -->",
  "## Third lesson",
  "",
  "yet another orthogonal note about coffee tea espresso latte",
  "",
].join("\n");

test("computeBodyJaccardScore: empty CLAUDE.md yields the zero-shape record", () => {
  const result = computeBodyJaccardScore({
    candidateBody: "any candidate body whatsoever",
    claudeMd: "",
  });
  assert.equal(result.maxScore, 0);
  assert.equal(result.sectionsCompared, 0);
  assert.equal(result.matchedSectionId, null);
});

test("computeBodyJaccardScore: CLAUDE.md without sentinel headers yields zero", () => {
  // parseClaudeMdSections only matches summarizer-emitted sentinels; a target
  // repo's hand-edited CLAUDE.md without any sentinels has zero parseable
  // sections. The empty-result path must still report cleanly.
  const result = computeBodyJaccardScore({
    candidateBody: "candidate body",
    claudeMd: "# Header\n\nHand-written prose, no sentinels here.\n",
  });
  assert.equal(result.maxScore, 0);
  assert.equal(result.sectionsCompared, 0);
  assert.equal(result.matchedSectionId, null);
});

test("computeBodyJaccardScore: counts all sentinel sections and selects the highest scorer", () => {
  const result = computeBodyJaccardScore({
    candidateBody:
      "shared lesson body about typed-data signing for ledger devices",
    claudeMd: SECTION_FIXTURE,
  });
  assert.equal(result.sectionsCompared, 3);
  assert.equal(result.matchedSectionId, "s1");
  assert.ok(
    result.maxScore > 0.9,
    `expected near-perfect overlap on identical body, got ${result.maxScore}`,
  );
});

test("computeBodyJaccardScore: orthogonal candidate scores low against every section", () => {
  const result = computeBodyJaccardScore({
    candidateBody:
      "completely orthogonal vocabulary xyzzy plover frotz quetzal",
    claudeMd: SECTION_FIXTURE,
  });
  assert.equal(result.sectionsCompared, 3);
  assert.ok(
    result.maxScore < 0.1,
    `orthogonal candidate should score low; got ${result.maxScore}`,
  );
});

test("loadComparandClaudeMd: returns empty string when target file is missing", async () => {
  // global tier with a non-existent domain → ENOENT path → empty string,
  // matching the issue's empty-result acceptance criterion.
  const content = await loadComparandClaudeMd(
    "global",
    `nonexistent-domain-${process.pid}-${++counter}`,
  );
  assert.equal(content, "");
});

test("appendBodyJaccardLogLine: writes the documented JSONL shape, one line per call", async () => {
  await withTempLogPath(async (filePath) => {
    const line: BodyJaccardLogLine = {
      ts: "2026-05-08T12:00:00.000Z",
      event: "lesson.body_jaccard",
      candidateAgentId: "agent-test-1",
      candidateDomain: "typed-data",
      tier: "target",
      maxScore: 0.42,
      matchedSectionId: "s3",
      sectionsCompared: 12,
    };
    await appendBodyJaccardLogLine(line, { filePath });
    await appendBodyJaccardLogLine(
      { ...line, candidateAgentId: "agent-test-2", maxScore: 0 },
      { filePath },
    );
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 2);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.event, "lesson.body_jaccard");
    assert.equal(parsed.candidateAgentId, "agent-test-1");
    assert.equal(parsed.candidateDomain, "typed-data");
    assert.equal(parsed.tier, "target");
    assert.equal(parsed.maxScore, 0.42);
    assert.equal(parsed.matchedSectionId, "s3");
    assert.equal(parsed.sectionsCompared, 12);
    const parsed2 = JSON.parse(lines[1]);
    assert.equal(parsed2.candidateAgentId, "agent-test-2");
    assert.equal(parsed2.maxScore, 0);
  });
});

test("appendBodyJaccardLogLine: zero-shape record from empty CLAUDE.md round-trips through the log", async () => {
  await withTempLogPath(async (filePath) => {
    const score = computeBodyJaccardScore({
      candidateBody: "candidate body content",
      claudeMd: "",
    });
    const line: BodyJaccardLogLine = {
      ts: "2026-05-08T12:00:00.000Z",
      event: "lesson.body_jaccard",
      candidateAgentId: "agent-empty",
      candidateDomain: "solana",
      tier: "global",
      ...score,
    };
    await appendBodyJaccardLogLine(line, { filePath });
    const parsed = JSON.parse((await fs.readFile(filePath, "utf-8")).trim());
    assert.equal(parsed.maxScore, 0);
    assert.equal(parsed.sectionsCompared, 0);
    assert.equal(parsed.matchedSectionId, null);
    assert.equal(parsed.tier, "global");
  });
});

test("BODY_JACCARD_LOG_PATH: lives under STATE_DIR (gitignored)", () => {
  // Sanity check: the production log file path should be `state/lesson-body-jaccard.jsonl`
  // so it stays gitignored alongside the rest of the state files.
  assert.match(BODY_JACCARD_LOG_PATH, /[/\\]state[/\\]lesson-body-jaccard\.jsonl$/);
});
