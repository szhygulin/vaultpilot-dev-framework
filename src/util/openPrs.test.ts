import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpenVpDevPrs } from "../git/openPrs.js";

test("extracts vp-dev PRs from a mixed PR list", () => {
  const records = [
    { number: 100, url: "https://github.com/o/r/pull/100", headRefName: "feature/foo" },
    { number: 101, url: "https://github.com/o/r/pull/101", headRefName: "vp-dev/agent-e22f/issue-29" },
    { number: 102, url: "https://github.com/o/r/pull/102", headRefName: "vp-dev/agent-5ade/issue-32" },
    { number: 103, url: "https://github.com/o/r/pull/103", headRefName: "main" },
  ];
  const out = parseOpenVpDevPrs(records);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    issueId: 29,
    agentId: "agent-e22f",
    branch: "vp-dev/agent-e22f/issue-29",
    prUrl: "https://github.com/o/r/pull/101",
    prNumber: 101,
  });
  assert.equal(out[1].issueId, 32);
  assert.equal(out[1].agentId, "agent-5ade");
});

test("ignores branches that don't match the vp-dev shape", () => {
  const records = [
    { number: 1, url: "u", headRefName: "vp-dev/issue-29" }, // missing agent segment
    { number: 2, url: "u", headRefName: "vp-dev/agent-x/29" }, // missing issue- prefix
    { number: 3, url: "u", headRefName: "vp-dev/agent-AB/issue-29" }, // uppercase agent id
    { number: 4, url: "u", headRefName: "renovate/vp-dev/agent-x/issue-1" }, // not at root
  ];
  assert.equal(parseOpenVpDevPrs(records).length, 0);
});

test("accepts the canonical agentId charset (lowercase alnum)", () => {
  const records = [
    { number: 1, url: "u", headRefName: "vp-dev/agent-75a0/issue-62" },
    { number: 2, url: "u", headRefName: "vp-dev/agent-916a/issue-41" },
    { number: 3, url: "u", headRefName: "vp-dev/agent-ef41/issue-35" },
  ];
  const out = parseOpenVpDevPrs(records);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((p) => [p.agentId, p.issueId]),
    [
      ["agent-75a0", 62],
      ["agent-916a", 41],
      ["agent-ef41", 35],
    ],
  );
});

test("empty input → empty output", () => {
  assert.deepEqual(parseOpenVpDevPrs([]), []);
});

test("multi-digit issue numbers are parsed correctly", () => {
  const records = [
    { number: 1, url: "u", headRefName: "vp-dev/agent-x/issue-1234" },
  ];
  const out = parseOpenVpDevPrs(records);
  assert.equal(out[0].issueId, 1234);
});
