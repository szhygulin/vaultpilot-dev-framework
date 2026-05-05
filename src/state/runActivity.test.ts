import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultRunLogPath,
  emptyRunActivity,
  formatTimeSince,
  parseRunActivity,
} from "./runActivity.js";

const T0 = "2026-05-05T16:00:00.000Z";
const T1 = "2026-05-05T16:00:05.000Z";
const T2 = "2026-05-05T16:00:10.000Z";
const T3 = "2026-05-05T16:00:15.000Z";

function jsonl(...lines: object[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n");
}

test("parseRunActivity: empty buffer yields empty result", () => {
  const a = parseRunActivity({ jsonl: "" });
  assert.deepEqual(a, emptyRunActivity());
});

test("parseRunActivity: tool_use events accumulate per-issue tool counts", () => {
  const buf = jsonl(
    { ts: T0, event: "agent.tool_use", agentId: "agent-916a", issueId: 131, tool: "Read", input: '"src/cli.ts"' },
    { ts: T1, event: "agent.tool_use", agentId: "agent-916a", issueId: 131, tool: "Bash", input: "npm test" },
    { ts: T2, event: "agent.tool_use", agentId: "agent-916a", issueId: 131, tool: "Read", input: '"src/types.ts"' },
    { ts: T3, event: "agent.tool_use", agentId: "agent-92ff", issueId: 128, tool: "Edit", input: "src/foo.ts" },
  );
  const a = parseRunActivity({ jsonl: buf });
  assert.deepEqual(a.byIssue["131"].toolCounts, { Read: 2, Bash: 1 });
  assert.equal(a.byIssue["131"].totalToolCalls, 3);
  assert.deepEqual(a.byIssue["128"].toolCounts, { Edit: 1 });
  assert.equal(a.byIssue["128"].totalToolCalls, 1);
});

test("parseRunActivity: lastEventTs tracks the most recent issue-scoped event regardless of type", () => {
  // agent.message after agent.tool_use should bump lastEventTs even
  // though it doesn't increment any tool count.
  const buf = jsonl(
    { ts: T0, event: "agent.tool_use", issueId: 131, tool: "Read", input: '"src/x.ts"' },
    { ts: T1, event: "agent.message", issueId: 131, preview: "Now let me build" },
  );
  const a = parseRunActivity({ jsonl: buf });
  assert.equal(a.byIssue["131"].lastEventTs, T1);
  assert.match(a.byIssue["131"].lastEventDescription ?? "", /Now let me build/);
});

test("parseRunActivity: lastEventDescription combines tool + truncated input", () => {
  const buf = jsonl(
    { ts: T0, event: "agent.tool_use", issueId: 131, tool: "Bash", input: "npm test" },
  );
  const a = parseRunActivity({ jsonl: buf });
  assert.equal(a.byIssue["131"].lastEventDescription, "Bash npm test");
});

test("parseRunActivity: lastEventDescription truncates long inputs to <=80 chars", () => {
  const longInput = "x".repeat(200);
  const buf = jsonl(
    { ts: T0, event: "agent.tool_use", issueId: 131, tool: "Bash", input: longInput },
  );
  const a = parseRunActivity({ jsonl: buf });
  const desc = a.byIssue["131"].lastEventDescription ?? "";
  assert.ok(desc.length <= 80, `description should fit within 80 chars, got ${desc.length}`);
  assert.match(desc, /\.\.\.$/);
});

test("parseRunActivity: malformed lines are silently skipped", () => {
  const buf = [
    "not-json-at-all",
    JSON.stringify({ ts: T0, event: "agent.tool_use", issueId: 131, tool: "Read" }),
    "{half-broken",
    JSON.stringify({ ts: T1, event: "agent.tool_use", issueId: 131, tool: "Bash" }),
  ].join("\n");
  const a = parseRunActivity({ jsonl: buf });
  assert.deepEqual(a.byIssue["131"].toolCounts, { Read: 1, Bash: 1 });
});

test("parseRunActivity: lines missing ts or event are dropped", () => {
  const buf = jsonl(
    { event: "agent.tool_use", issueId: 131, tool: "Read" }, // no ts
    { ts: T0, issueId: 131, tool: "Read" }, // no event
    { ts: T1, event: "agent.tool_use", issueId: 131, tool: "Edit" }, // valid
  );
  const a = parseRunActivity({ jsonl: buf });
  assert.deepEqual(a.byIssue["131"].toolCounts, { Edit: 1 });
});

test("parseRunActivity: events without issueId are not aggregated per-issue", () => {
  // Run-level events (run.started, tick.proposal) must not corrupt
  // per-issue activity. They can still appear in recentEvents if the
  // event type is in the tail allowlist.
  const buf = jsonl(
    { ts: T0, event: "run.started", runId: "run-x" },
    { ts: T1, event: "agent.tool_use", issueId: 131, tool: "Read" },
  );
  const a = parseRunActivity({ jsonl: buf });
  assert.deepEqual(Object.keys(a.byIssue), ["131"]);
});

test("parseRunActivity: recentEvents limited to N most-recent entries in chronological order", () => {
  const events = Array.from({ length: 20 }, (_, i) => ({
    ts: `2026-05-05T16:00:${String(i).padStart(2, "0")}.000Z`,
    event: "agent.tool_use",
    issueId: 131,
    tool: "Read",
    input: `"file-${i}.ts"`,
  }));
  const a = parseRunActivity({ jsonl: jsonl(...events), recentEventsLimit: 5 });
  assert.equal(a.recentEvents.length, 5);
  // Last 5 by ts → file-15..file-19
  assert.match(a.recentEvents[0].detail ?? "", /file-15/);
  assert.match(a.recentEvents[4].detail ?? "", /file-19/);
});

test("parseRunActivity: recentEvents tail excludes orchestrator/permission noise but keeps spawned + completed", () => {
  const buf = jsonl(
    { ts: T0, event: "agent.spawned", issueId: 131 },
    { ts: T1, event: "permission.evaluated", issueId: 131, tool: "Bash", behavior: "allow" },
    { ts: T2, event: "agent.tool_use", issueId: 131, tool: "Bash" },
    { ts: T3, event: "agent.completed", issueId: 131 },
  );
  const a = parseRunActivity({ jsonl: buf });
  const eventNames = a.recentEvents.map((e) => e.event);
  assert.ok(eventNames.includes("agent.spawned"));
  assert.ok(eventNames.includes("agent.tool_use"));
  assert.ok(eventNames.includes("agent.completed"));
  assert.ok(!eventNames.includes("permission.evaluated"));
});

test("parseRunActivity: recentEvents stays sorted chronologically even on out-of-order input", () => {
  const buf = jsonl(
    { ts: T2, event: "agent.tool_use", issueId: 131, tool: "Read" },
    { ts: T0, event: "agent.tool_use", issueId: 131, tool: "Bash" },
    { ts: T1, event: "agent.tool_use", issueId: 131, tool: "Edit" },
  );
  const a = parseRunActivity({ jsonl: buf });
  assert.deepEqual(
    a.recentEvents.map((e) => e.ts),
    [T0, T1, T2],
  );
});

test("formatTimeSince: seconds-only when under a minute", () => {
  const now = new Date("2026-05-05T16:00:30.000Z");
  assert.equal(formatTimeSince("2026-05-05T16:00:18.000Z", now), "12s ago");
});

test("formatTimeSince: minutes + seconds when between 1 and 60 minutes", () => {
  const now = new Date("2026-05-05T16:05:42.000Z");
  assert.equal(formatTimeSince("2026-05-05T16:00:30.000Z", now), "5m12s ago");
});

test("formatTimeSince: drops seconds suffix when on a minute boundary", () => {
  const now = new Date("2026-05-05T16:05:00.000Z");
  assert.equal(formatTimeSince("2026-05-05T16:00:00.000Z", now), "5m ago");
});

test("formatTimeSince: hours + minutes for runs over an hour", () => {
  const now = new Date("2026-05-05T18:34:00.000Z");
  assert.equal(formatTimeSince("2026-05-05T16:00:00.000Z", now), "2h34m ago");
});

test("formatTimeSince: returns undefined for missing or future-dated ts", () => {
  const now = new Date("2026-05-05T16:00:00.000Z");
  assert.equal(formatTimeSince(undefined, now), undefined);
  assert.equal(formatTimeSince("2026-05-05T16:01:00.000Z", now), undefined);
  assert.equal(formatTimeSince("not-a-timestamp", now), undefined);
});

test("defaultRunLogPath: builds <baseDir>/logs/<runId>.jsonl", () => {
  assert.equal(
    defaultRunLogPath("run-2026-05-05T16-33-14-458Z", "/tmp/repo"),
    "/tmp/repo/logs/run-2026-05-05T16-33-14-458Z.jsonl",
  );
});
