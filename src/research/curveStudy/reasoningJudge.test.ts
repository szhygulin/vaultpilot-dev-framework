import { test } from "node:test";
import assert from "node:assert/strict";
import { blindArtifact, gradeReasoning, type LlmCall } from "./reasoningJudge.js";

function makeLlm(scores: Array<number | { score: number; rationale: string } | "error" | "malformed">): LlmCall {
  let i = 0;
  return async () => {
    if (i >= scores.length) return { raw: "", isError: true, errorReason: "out of synthetic responses" };
    const s = scores[i++];
    if (s === "error") return { raw: "", isError: true, errorReason: "rate_limit" };
    if (s === "malformed") return { raw: "not valid json", isError: false, costUsd: 0.05 };
    if (typeof s === "number") {
      return {
        raw: JSON.stringify({ score: s, rationale: `rationale-${s}` }),
        isError: false,
        costUsd: 0.05,
      };
    }
    return { raw: JSON.stringify(s), isError: false, costUsd: 0.05 };
  };
}

test("blindArtifact: strips agent IDs", () => {
  const input = "agent-916a opened branch and agent-916a-trim-50000-s52026 reviewed it";
  const out = blindArtifact(input);
  assert.doesNotMatch(out, /agent-916a/);
  assert.match(out, /<agent>/);
});

test("blindArtifact: strips branch names", () => {
  const input = "Pushed to vp-dev/agent-916a/issue-190 and vp-dev/agent-92ff/issue-200-incomplete-run-x";
  const out = blindArtifact(input);
  assert.doesNotMatch(out, /vp-dev\/agent/);
  assert.match(out, /<branch>/);
});

test("blindArtifact: strips replicate index hints", () => {
  const input = "replicate=2 and rep=3 and -r5- in the filename";
  const out = blindArtifact(input);
  assert.doesNotMatch(out, /replicate=\d/);
  assert.doesNotMatch(out, /rep=\d/);
  assert.doesNotMatch(out, /-r5-/);
});

test("blindArtifact: strips trim-size hints", () => {
  const input = "trim-50000 and trim-22000-s52026 and trim-6000";
  const out = blindArtifact(input);
  assert.doesNotMatch(out, /trim-\d+/);
  assert.match(out, /<trim>/);
});

test("blindArtifact: leaves substantive content untouched", () => {
  const input = "diff --git a/src/foo.ts b/src/foo.ts\n@@ -1,3 +1,3 @@\n-old\n+new\n";
  const out = blindArtifact(input);
  assert.equal(out, input);
});

test("gradeReasoning: returns median + variance across K=3 samples", async () => {
  const r = await gradeReasoning({
    issueId: 1,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    diff: "diff --git a/foo.ts ...",
    k: 3,
    llmCall: makeLlm([35, 40, 45]),
  });
  assert.equal(r.isError, false);
  assert.equal(r.median, 40);
  assert.deepEqual(r.scores, [35, 40, 45]);
  assert.equal(r.variance, 25); // sample variance of 35,40,45
  assert.equal(r.partialFailure, false);
  assert.equal(r.rationales.length, 3);
});

test("gradeReasoning: K=3 with one failed sample reports partialFailure but still scores median of survivors", async () => {
  const r = await gradeReasoning({
    issueId: 2,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    diff: "diff",
    k: 3,
    llmCall: makeLlm([35, "error", 45]),
  });
  assert.equal(r.isError, false);
  assert.equal(r.partialFailure, true);
  assert.deepEqual(r.scores, [35, 45]);
  assert.equal(r.median, 40);
});

test("gradeReasoning: returns isError=true when all samples fail", async () => {
  const r = await gradeReasoning({
    issueId: 3,
    issueTitle: "T",
    issueBody: "B",
    decision: "pushback",
    pushbackComment: "comment",
    k: 3,
    llmCall: makeLlm(["error", "error", "error"]),
  });
  assert.equal(r.isError, true);
  assert.equal(r.median, 0);
  assert.equal(r.scores.length, 0);
});

test("gradeReasoning: returns isError=true when malformed JSON across all samples", async () => {
  const r = await gradeReasoning({
    issueId: 4,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    diff: "diff",
    k: 2,
    llmCall: makeLlm(["malformed", "malformed"]),
  });
  assert.equal(r.isError, true);
  assert.equal(r.median, 0);
});

test("gradeReasoning: refuses when decision='implement' without diff", async () => {
  const r = await gradeReasoning({
    issueId: 5,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    k: 2,
    llmCall: makeLlm([25, 25]),
  });
  assert.equal(r.isError, true);
  assert.match(r.errorReason ?? "", /no diff supplied/);
});

test("gradeReasoning: refuses when decision='pushback' without comment", async () => {
  const r = await gradeReasoning({
    issueId: 6,
    issueTitle: "T",
    issueBody: "B",
    decision: "pushback",
    k: 2,
    llmCall: makeLlm([25, 25]),
  });
  assert.equal(r.isError, true);
  assert.match(r.errorReason ?? "", /no comment supplied/);
});

test("gradeReasoning: refuses when decision='error' (not gradable)", async () => {
  const r = await gradeReasoning({
    issueId: 7,
    issueTitle: "T",
    issueBody: "B",
    decision: "error",
    k: 2,
    llmCall: makeLlm([25, 25]),
  });
  assert.equal(r.isError, true);
  assert.match(r.errorReason ?? "", /not gradable/);
});

test("gradeReasoning: median of even-sized survivors uses average of two middle values", async () => {
  const r = await gradeReasoning({
    issueId: 8,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    diff: "d",
    k: 4,
    llmCall: makeLlm([5, 10, 40, 45]),
  });
  // Median of [5,10,40,45] = (10+40)/2 = 25
  assert.equal(r.median, 25);
});

test("gradeReasoning: blinds the artifact before sending to the judge", async () => {
  let captured = "";
  const llm: LlmCall = async ({ userPrompt }) => {
    captured = userPrompt;
    return { raw: JSON.stringify({ score: 25, rationale: "x" }), isError: false };
  };
  await gradeReasoning({
    issueId: 9,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    diff: "agent-916a-trim-50000 wrote: vp-dev/agent-916a/issue-190",
    k: 1,
    llmCall: llm,
  });
  assert.doesNotMatch(captured, /agent-916a/);
  assert.doesNotMatch(captured, /trim-50000/);
});

test("gradeReasoning: scores outside 0-50 are rejected by the schema", async () => {
  const llm: LlmCall = async () => ({
    raw: JSON.stringify({ score: 75, rationale: "x" }),
    isError: false,
  });
  const r = await gradeReasoning({
    issueId: 10,
    issueTitle: "T",
    issueBody: "B",
    decision: "implement",
    diff: "d",
    k: 1,
    llmCall: llm,
  });
  assert.equal(r.isError, true); // all samples (1) failed schema validation
});
