import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDuration,
  formatStatusJson,
  formatStatusText,
} from "../state/statusFormatter.js";
import type { RunActivity } from "../state/runActivity.js";
import type { RunState } from "../types.js";

function fixture(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: "run-2026-05-05T13-32-46-094Z",
    targetRepo: "szhygulin/vaultpilot-dev-framework",
    issueRange: { kind: "csv", ids: [119] },
    parallelism: 1,
    agents: [{ agentId: "agent-08c4", status: "idle" }],
    issues: {},
    tickCount: 2,
    startedAt: "2026-05-05T13:32:46.095Z",
    lastTickAt: "2026-05-05T13:38:55.000Z",
    dryRun: false,
    ...overrides,
  } as RunState;
}

test("formatStatusText: empty issues renders aggregate header without Issues block", () => {
  const text = formatStatusText(fixture());
  assert.match(text, /Run run-2026-05-05/);
  assert.match(text, /total=0 pending=0 in-flight=0 done=0 failed=0 aborted-budget=0/);
  assert.match(text, /agent agent-08c4: idle/);
  assert.doesNotMatch(text, /Issues:/);
});

test("formatStatusText: single done issue with PR url", () => {
  const text = formatStatusText(
    fixture({
      issues: {
        "119": {
          status: "done",
          agentId: "agent-08c4",
          outcome: "implement",
          prUrl: "https://github.com/x/y/pull/122",
        },
      },
    }),
  );
  assert.match(text, /total=1 pending=0 in-flight=0 done=1 failed=0/);
  assert.match(text, /Issues:/);
  assert.match(text, /#\s*119/);
  assert.match(text, /implement/);
  assert.match(text, /https:\/\/github\.com\/x\/y\/pull\/122/);
});

test("formatStatusText: failed issue surfaces error + partialBranchUrl + errorSubtype", () => {
  const text = formatStatusText(
    fixture({
      issues: {
        "84": {
          status: "failed",
          agentId: "agent-e287",
          outcome: "error",
          error: "error_max_turns",
          errorSubtype: "error_max_turns",
          parseError: "No JSON envelope found",
          partialBranchUrl: "https://github.com/x/y/tree/vp-dev/agent-e287/issue-84-incomplete-run-X",
        },
      },
    }),
  );
  assert.match(text, /failed/);
  assert.match(text, /error_max_turns/);
  assert.match(text, /partial:/);
  assert.match(text, /-incomplete-/);
  // errorSubtype suppressed when already in error string
  assert.equal((text.match(/error_max_turns/g) ?? []).length, 1);
});

test("formatStatusText: errorSubtype surfaced separately when not in error message", () => {
  const text = formatStatusText(
    fixture({
      issues: {
        "1": {
          status: "failed",
          error: "Unknown agent failure",
          errorSubtype: "error_during_execution",
        },
      },
    }),
  );
  assert.match(text, /errorSubtype: error_during_execution/);
});

test("formatStatusText: applies agent name from registry lookup", () => {
  const text = formatStatusText(
    fixture({
      agents: [{ agentId: "agent-08c4", status: "idle" }],
      issues: { "1": { status: "done", agentId: "agent-08c4", outcome: "implement" } },
    }),
    { agentNames: new Map([["agent-08c4", "Khwarizmi"]]) },
  );
  assert.match(text, /Khwarizmi \(agent-08c4\)/);
});

test("formatStatusText: maxCostUsd surfaces when set", () => {
  const text = formatStatusText(fixture({ maxCostUsd: 5.0 } as Partial<RunState>));
  assert.match(text, /maxCostUsd=5/);
});

test("formatStatusText: omits maxCostUsd line when undefined", () => {
  const text = formatStatusText(fixture());
  assert.doesNotMatch(text, /maxCostUsd/);
});

test("formatStatusJson: shape includes summary, agents, issues, durationMs", () => {
  const json = formatStatusJson(
    fixture({
      issues: {
        "119": {
          status: "done",
          agentId: "agent-08c4",
          outcome: "implement",
          prUrl: "https://github.com/x/y/pull/122",
        },
      },
    }),
    { agentNames: new Map([["agent-08c4", "Khwarizmi"]]) },
  );
  assert.equal(json.runId, "run-2026-05-05T13-32-46-094Z");
  assert.equal(json.summary.total, 1);
  assert.equal(json.summary.done, 1);
  assert.equal(json.summary.failed, 0);
  assert.equal(json.issues.length, 1);
  assert.equal(json.issues[0].id, 119);
  assert.equal(json.issues[0].agentName, "Khwarizmi");
  assert.equal(json.issues[0].prUrl, "https://github.com/x/y/pull/122");
  assert.ok(json.durationMs && json.durationMs > 0);
});

test("formatStatusJson: omits durationMs when timestamps missing", () => {
  const json = formatStatusJson(
    fixture({ startedAt: undefined, lastTickAt: undefined } as Partial<RunState>),
  );
  assert.equal(json.durationMs, undefined);
});

test("formatStatusJson: issues sorted numerically by id, not lexically", () => {
  const json = formatStatusJson(
    fixture({
      issues: {
        "12": { status: "done" },
        "2": { status: "done" },
        "100": { status: "done" },
        "9": { status: "done" },
      },
    }),
  );
  assert.deepEqual(
    json.issues.map((i) => i.id),
    [2, 9, 12, 100],
  );
});

test("formatDuration: minutes + seconds for short runs", () => {
  assert.equal(
    formatDuration("2026-05-05T13:00:00Z", "2026-05-05T13:06:09Z"),
    "6m9s",
  );
});

test("formatDuration: just seconds when under a minute", () => {
  assert.equal(
    formatDuration("2026-05-05T13:00:00Z", "2026-05-05T13:00:42Z"),
    "42s",
  );
});

test("formatDuration: hours + minutes + seconds for long runs", () => {
  assert.equal(
    formatDuration("2026-05-05T10:00:00Z", "2026-05-05T12:34:56Z"),
    "2h34m56s",
  );
});

test("formatDuration: returns undefined for missing timestamps", () => {
  assert.equal(formatDuration(undefined, "2026-05-05T13:06:09Z"), undefined);
  assert.equal(formatDuration("2026-05-05T13:00:00Z", undefined), undefined);
  assert.equal(formatDuration(undefined, undefined), undefined);
});

test("formatDuration: returns undefined for negative span (clock skew)", () => {
  assert.equal(
    formatDuration("2026-05-05T13:06:09Z", "2026-05-05T13:00:00Z"),
    undefined,
  );
});

// Issue #131: in-flight progress signals (cost, tool counts, recent events)

test("formatStatusText: cost-burn line bounded by ceiling when maxCostUsd set", () => {
  const text = formatStatusText(
    fixture({ costAccumulatedUsd: 2.31, maxCostUsd: 5.0 } as Partial<RunState>),
  );
  assert.match(text, /cost=\$2\.3100 \/ \$5\.0000/);
});

test("formatStatusText: cost-burn line shows '(no ceiling)' when maxCostUsd absent", () => {
  const text = formatStatusText(
    fixture({ costAccumulatedUsd: 0.42 } as Partial<RunState>),
  );
  assert.match(text, /cost=\$0\.4200 \(no ceiling\)/);
});

test("formatStatusText: cost line omitted when costAccumulatedUsd undefined (back-compat)", () => {
  const text = formatStatusText(fixture());
  assert.doesNotMatch(text, /cost=\$/);
});

test("formatStatusText: in-flight issue gets activity addendum (last activity + tool counts)", () => {
  const activity: RunActivity = {
    byIssue: {
      "131": {
        toolCounts: { Read: 22, Bash: 22, Edit: 8, Write: 2 },
        totalToolCalls: 54,
        lastEventTs: "2026-05-05T13:38:50.000Z",
        lastEventDescription: "Bash npm test",
      },
    },
    recentEvents: [],
  };
  const text = formatStatusText(
    fixture({
      issues: { "131": { status: "in-flight", agentId: "agent-916a" } },
    }),
    {
      activity,
      now: new Date("2026-05-05T13:38:55.000Z"),
    },
  );
  assert.match(text, /last activity: Bash npm test \(5s ago\)/);
  // Tool counts sorted by count descending, then alphabetically.
  assert.match(text, /tools: 22 Bash, 22 Read, 8 Edit, 2 Write \(54 total\)/);
});

test("formatStatusText: terminal issues skip activity addendum even when activity present", () => {
  const activity: RunActivity = {
    byIssue: {
      "131": {
        toolCounts: { Bash: 5 },
        totalToolCalls: 5,
        lastEventTs: "2026-05-05T13:38:50.000Z",
        lastEventDescription: "Bash npm test",
      },
    },
    recentEvents: [],
  };
  const text = formatStatusText(
    fixture({
      issues: {
        "131": { status: "done", agentId: "agent-916a", outcome: "implement", prUrl: "https://github.com/x/y/pull/1" },
      },
    }),
    { activity, now: new Date("2026-05-05T13:38:55.000Z") },
  );
  assert.doesNotMatch(text, /last activity:/);
  assert.doesNotMatch(text, /tools:/);
});

test("formatStatusText: recent events tail rendered when activity supplied and non-empty", () => {
  const activity: RunActivity = {
    byIssue: {},
    recentEvents: [
      { ts: "2026-05-05T13:38:50.000Z", issueId: 131, event: "agent.tool_use", detail: "Read 'src/cli.ts'" },
      { ts: "2026-05-05T13:38:55.000Z", issueId: 131, event: "agent.message", detail: "Now build and test" },
    ],
  };
  const text = formatStatusText(fixture(), { activity });
  assert.match(text, /Recent events \(last 2\):/);
  assert.match(text, /13:38:50/);
  assert.match(text, /agent\.tool_use/);
  assert.match(text, /Now build and test/);
});

test("formatStatusText: recent events tail omitted when activity undefined", () => {
  const text = formatStatusText(fixture());
  assert.doesNotMatch(text, /Recent events/);
});

test("formatStatusJson: includes costAccumulatedUsd when set", () => {
  const json = formatStatusJson(
    fixture({ costAccumulatedUsd: 1.23 } as Partial<RunState>),
  );
  assert.equal(json.costAccumulatedUsd, 1.23);
});

test("formatStatusJson: liveActivity present per in-flight issue when activity supplied", () => {
  const activity: RunActivity = {
    byIssue: {
      "131": {
        toolCounts: { Read: 3 },
        totalToolCalls: 3,
        lastEventTs: "2026-05-05T13:38:50.000Z",
        lastEventDescription: "Read src/x.ts",
      },
    },
    recentEvents: [
      { ts: "2026-05-05T13:38:50.000Z", issueId: 131, event: "agent.tool_use", detail: "Read src/x.ts" },
    ],
  };
  const json = formatStatusJson(
    fixture({
      issues: { "131": { status: "in-flight", agentId: "agent-916a" } },
    }),
    { activity },
  );
  const issue = json.issues[0];
  assert.ok(issue.liveActivity);
  assert.equal(issue.liveActivity?.totalToolCalls, 3);
  assert.equal(issue.liveActivity?.lastEventDescription, "Read src/x.ts");
  assert.equal(json.recentEvents?.length, 1);
});

test("formatStatusJson: liveActivity + recentEvents undefined when activity not supplied (back-compat)", () => {
  const json = formatStatusJson(fixture());
  assert.equal(json.recentEvents, undefined);
});

// Issue #149 (follow-up to #142 / #141 Phase 1): surface nextPhaseIssueUrl
// in both formatters so the auto-filed Phase N+1 follow-up issue is
// discoverable from `vp-dev status` without scraping run-state JSON.

test("formatStatusText: surfaces nextPhaseIssueUrl on a 'next phase:' addendum line when set", () => {
  const text = formatStatusText(
    fixture({
      issues: {
        "142": {
          status: "done",
          agentId: "agent-92ff",
          outcome: "implement",
          prUrl: "https://github.com/x/y/pull/200",
          nextPhaseIssueUrl: "https://github.com/x/y/issues/201",
        },
      },
    }),
  );
  assert.match(text, /next phase: https:\/\/github\.com\/x\/y\/issues\/201/);
});

test("formatStatusText: omits 'next phase:' line when nextPhaseIssueUrl absent (back-compat)", () => {
  const text = formatStatusText(
    fixture({
      issues: {
        "142": {
          status: "done",
          agentId: "agent-92ff",
          outcome: "implement",
          prUrl: "https://github.com/x/y/pull/200",
        },
      },
    }),
  );
  assert.doesNotMatch(text, /next phase:/);
});

test("formatStatusJson: includes nextPhaseIssueUrl on per-issue object when set", () => {
  const json = formatStatusJson(
    fixture({
      issues: {
        "142": {
          status: "done",
          agentId: "agent-92ff",
          outcome: "implement",
          prUrl: "https://github.com/x/y/pull/200",
          nextPhaseIssueUrl: "https://github.com/x/y/issues/201",
        },
      },
    }),
  );
  assert.equal(
    json.issues[0].nextPhaseIssueUrl,
    "https://github.com/x/y/issues/201",
  );
});

test("formatStatusJson: nextPhaseIssueUrl undefined on per-issue object when entry omits it (back-compat)", () => {
  const json = formatStatusJson(
    fixture({
      issues: { "142": { status: "done", agentId: "agent-92ff", outcome: "implement" } },
    }),
  );
  assert.equal(json.issues[0].nextPhaseIssueUrl, undefined);
});
