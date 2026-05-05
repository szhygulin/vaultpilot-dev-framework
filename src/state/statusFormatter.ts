import type { IssueStatus, RunIssueEntry, RunState } from "../types.js";
import { formatTimeSince, type RunActivity, type IssueActivity, type RecentEvent } from "./runActivity.js";

/**
 * Pure formatters for `vp-dev status` output. Both the text and JSON
 * variants take a `RunState` plus an optional `agentNames` lookup (so the
 * registry I/O stays in the CLI layer and these helpers are testable
 * without touching disk).
 *
 * Issue #131: an optional `activity` plus `now` clock can be threaded
 * through to surface in-flight progress signals (per-issue tool counts,
 * time since last activity, recent events tail). Both are optional —
 * the formatter degrades gracefully to the pre-#131 output when not
 * supplied so terminal-state runs and tests that don't care about
 * activity stay simple.
 */
export interface StatusFormatOpts {
  /** Map of agentId -> display name. Agents not in the map render with bare ID. */
  agentNames?: Map<string, string | undefined>;
  /** Aggregated JSONL-log activity from `loadRunActivity`. Optional. */
  activity?: RunActivity;
  /** Reference clock for "X ago" computations. Defaults to `new Date()`. */
  now?: Date;
}

const STATUS_KEYS: IssueStatus[] = [
  "pending",
  "in-flight",
  "done",
  "failed",
  "aborted-budget",
];

export function formatStatusText(state: RunState, opts: StatusFormatOpts = {}): string {
  const total = Object.keys(state.issues).length;
  const counts = countByStatus(state);
  const nameOf = opts.agentNames ?? new Map<string, string | undefined>();
  const activity = opts.activity;
  const now = opts.now ?? new Date();

  const lines: string[] = [];
  lines.push(`Run ${state.runId} on ${state.targetRepo}`);
  const countParts = STATUS_KEYS.map((k) => `${k}=${counts[k]}`).join(" ");
  lines.push(`  total=${total} ${countParts}`);

  const duration = formatDuration(state.startedAt, state.lastTickAt);
  const metaParts = [
    `ticks=${state.tickCount}`,
    `parallelism=${state.parallelism}`,
    `dryRun=${state.dryRun}`,
  ];
  if (duration) metaParts.push(`duration=${duration}`);
  lines.push(`  ${metaParts.join(" ")}`);

  if (state.maxCostUsd !== undefined) {
    lines.push(`  maxCostUsd=${state.maxCostUsd}`);
  }

  // Issue #131: surface live cost-burn whenever the orchestrator has
  // persisted it. Format depends on whether a per-run ceiling is set —
  // `$X.XXXX / $Y.YYYY` when bounded so the operator can see headroom,
  // `$X.XXXX (no ceiling)` when unbounded.
  if (state.costAccumulatedUsd !== undefined) {
    const total = state.costAccumulatedUsd.toFixed(4);
    if (state.maxCostUsd !== undefined) {
      lines.push(`  cost=$${total} / $${state.maxCostUsd.toFixed(4)}`);
    } else {
      lines.push(`  cost=$${total} (no ceiling)`);
    }
  }

  for (const a of state.agents) {
    const name = nameOf.get(a.agentId);
    const label = name ? `${name} (${a.agentId})` : a.agentId;
    lines.push(`  agent ${label}: ${a.status}`);
  }

  if (total > 0) {
    lines.push("");
    lines.push("  Issues:");
    const issueIds = Object.keys(state.issues).sort((a, b) => Number(a) - Number(b));
    for (const id of issueIds) {
      const e = state.issues[id];
      lines.push(...renderIssueLines(id, e, nameOf));
      // Per-issue activity addendum: only renders when we have activity
      // data for this issue AND the issue is in-flight. Terminal issues
      // already have their PR / error rendered above; tool counts after
      // completion add noise without value.
      if (activity && e.status === "in-flight") {
        const issueActivity = activity.byIssue[id];
        if (issueActivity) {
          lines.push(...renderActivityLines(issueActivity, now));
        }
      }
    }
  }

  // Recent events tail — only when activity was supplied AND the tail
  // is non-empty. Stays at the bottom of the output so the operator's
  // eye lands there last when scanning top-to-bottom.
  if (activity && activity.recentEvents.length > 0) {
    lines.push("");
    lines.push(`  Recent events (last ${activity.recentEvents.length}):`);
    for (const ev of activity.recentEvents) {
      lines.push(formatRecentEventLine(ev));
    }
  }

  return lines.join("\n") + "\n";
}

function renderActivityLines(activity: IssueActivity, now: Date): string[] {
  const out: string[] = [];
  const sinceLabel = formatTimeSince(activity.lastEventTs, now);
  if (activity.lastEventDescription) {
    const since = sinceLabel ? ` (${sinceLabel})` : "";
    out.push(`           last activity: ${activity.lastEventDescription}${since}`);
  } else if (sinceLabel) {
    out.push(`           last activity: ${sinceLabel}`);
  }
  if (activity.totalToolCalls > 0) {
    const breakdown = Object.entries(activity.toolCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tool, n]) => `${n} ${tool}`)
      .join(", ");
    out.push(`           tools: ${breakdown} (${activity.totalToolCalls} total)`);
  }
  return out;
}

function formatRecentEventLine(ev: RecentEvent): string {
  const time = ev.ts.length >= 19 ? ev.ts.slice(11, 19) : ev.ts;
  const issueLabel = ev.issueId !== undefined ? `#${ev.issueId}` : "—";
  const detail = ev.detail ? `  ${ev.detail}` : "";
  return `    ${time}  ${issueLabel.padEnd(6)} ${ev.event}${detail}`;
}

export interface IssueLiveActivityJson {
  /** ISO-8601 ts of the most recent issue-scoped event. */
  lastEventTs?: string;
  /** Short description of the most recent event (tool+input or message preview). */
  lastEventDescription?: string;
  /** Tool name -> call count. Empty when no tool calls observed. */
  toolCounts: Record<string, number>;
  /** Sum of `toolCounts` values. */
  totalToolCalls: number;
}

export interface StatusJson {
  runId: string;
  targetRepo: string;
  startedAt?: string;
  lastTickAt?: string;
  durationMs?: number;
  parallelism: number;
  dryRun: boolean;
  tickCount: number;
  maxCostUsd?: number;
  /** Running USD total, when persisted by the orchestrator (issue #131). */
  costAccumulatedUsd?: number;
  summary: { total: number } & Record<IssueStatus, number>;
  agents: { agentId: string; agentName?: string; status: string }[];
  issues: {
    id: number;
    status: IssueStatus;
    agentId?: string;
    agentName?: string;
    outcome?: string;
    prUrl?: string;
    commentUrl?: string;
    partialBranchUrl?: string;
    error?: string;
    errorSubtype?: string;
    parseError?: string;
    /**
     * URL of the auto-filed Phase N+1 follow-up issue (issue #141 Phase 1
     * persists this onto `RunIssueEntry`; #142 wires the CLI flag that
     * actually populates it; #149 surfaces it through the formatter). Absent
     * for runs dispatched without `--auto-phase-followup`, agents that ran
     * pushback / error paths, and pre-#141 run-state entries.
     */
    nextPhaseIssueUrl?: string;
    /** Present only when `opts.activity` was supplied and the issue had any events. */
    liveActivity?: IssueLiveActivityJson;
  }[];
  /** Last N events from the JSONL log, present only when `opts.activity` was supplied. */
  recentEvents?: { ts: string; issueId?: number; event: string; detail?: string }[];
}

export function formatStatusJson(state: RunState, opts: StatusFormatOpts = {}): StatusJson {
  const counts = countByStatus(state);
  const nameOf = opts.agentNames ?? new Map<string, string | undefined>();
  const activity = opts.activity;
  const total = Object.keys(state.issues).length;
  const durationMs =
    state.startedAt && state.lastTickAt
      ? Date.parse(state.lastTickAt) - Date.parse(state.startedAt)
      : undefined;

  return {
    runId: state.runId,
    targetRepo: state.targetRepo,
    startedAt: state.startedAt,
    lastTickAt: state.lastTickAt,
    durationMs:
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
        ? durationMs
        : undefined,
    parallelism: state.parallelism,
    dryRun: state.dryRun,
    tickCount: state.tickCount,
    maxCostUsd: state.maxCostUsd,
    costAccumulatedUsd: state.costAccumulatedUsd,
    summary: { total, ...counts },
    agents: state.agents.map((a) => ({
      agentId: a.agentId,
      agentName: nameOf.get(a.agentId),
      status: a.status,
    })),
    issues: Object.keys(state.issues)
      .sort((a, b) => Number(a) - Number(b))
      .map((id) => {
        const e = state.issues[id];
        const issueActivity = activity?.byIssue[id];
        return {
          id: Number(id),
          status: e.status,
          agentId: e.agentId,
          agentName: e.agentId ? nameOf.get(e.agentId) : undefined,
          outcome: e.outcome,
          prUrl: e.prUrl,
          commentUrl: e.commentUrl,
          partialBranchUrl: e.partialBranchUrl,
          error: e.error,
          errorSubtype: e.errorSubtype,
          parseError: e.parseError,
          nextPhaseIssueUrl: e.nextPhaseIssueUrl,
          liveActivity: issueActivity
            ? {
                lastEventTs: issueActivity.lastEventTs,
                lastEventDescription: issueActivity.lastEventDescription,
                toolCounts: issueActivity.toolCounts,
                totalToolCalls: issueActivity.totalToolCalls,
              }
            : undefined,
        };
      }),
    recentEvents: activity ? activity.recentEvents.map((ev) => ({ ...ev })) : undefined,
  };
}

export function formatDuration(startedAt?: string, lastTickAt?: string): string | undefined {
  if (!startedAt || !lastTickAt) return undefined;
  const ms = Date.parse(lastTickAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function countByStatus(state: RunState): Record<IssueStatus, number> {
  const counts: Record<IssueStatus, number> = {
    pending: 0,
    "in-flight": 0,
    done: 0,
    failed: 0,
    "aborted-budget": 0,
  };
  for (const e of Object.values(state.issues)) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
  }
  return counts;
}

function renderIssueLines(
  id: string,
  e: RunIssueEntry,
  nameOf: Map<string, string | undefined>,
): string[] {
  const out: string[] = [];
  const agentLabel = e.agentId
    ? nameOf.get(e.agentId)
      ? `${nameOf.get(e.agentId)} (${e.agentId})`
      : e.agentId
    : "—";
  const outcome = e.outcome ?? "—";
  const detail =
    e.prUrl ??
    (e.error ? truncate(e.error, 80) : "") ??
    e.commentUrl ??
    "";
  out.push(`    #${id.padStart(4)}  ${e.status.padEnd(15)} ${agentLabel.padEnd(30)} ${outcome.padEnd(10)} ${detail}`);
  if (e.partialBranchUrl) {
    out.push(`           partial: ${e.partialBranchUrl}`);
  }
  if (e.errorSubtype && !e.error?.includes(e.errorSubtype)) {
    out.push(`           errorSubtype: ${e.errorSubtype}`);
  }
  if (e.commentUrl && e.prUrl) {
    out.push(`           comment: ${e.commentUrl}`);
  }
  // Issue #149 (follow-up to #142 / #141 Phase 1): surface the auto-filed
  // Phase N+1 follow-up issue URL when the orchestrator persisted one onto
  // the entry. Mirrors the `partial:` indent so multi-line addenda stay
  // visually aligned in the per-issue block.
  if (e.nextPhaseIssueUrl) {
    out.push(`           next phase: ${e.nextPhaseIssueUrl}`);
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}
