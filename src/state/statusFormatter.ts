import type { IssueStatus, RunIssueEntry, RunState } from "../types.js";

/**
 * Pure formatters for `vp-dev status` output. Both the text and JSON
 * variants take a `RunState` plus an optional `agentNames` lookup (so the
 * registry I/O stays in the CLI layer and these helpers are testable
 * without touching disk).
 */
export interface StatusFormatOpts {
  /** Map of agentId -> display name. Agents not in the map render with bare ID. */
  agentNames?: Map<string, string | undefined>;
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
    }
  }

  return lines.join("\n") + "\n";
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
  }[];
}

export function formatStatusJson(state: RunState, opts: StatusFormatOpts = {}): StatusJson {
  const counts = countByStatus(state);
  const nameOf = opts.agentNames ?? new Map<string, string | undefined>();
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
        };
      }),
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
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}
