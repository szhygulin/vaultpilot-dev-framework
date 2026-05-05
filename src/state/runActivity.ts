import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Pure helpers (apart from `loadRunActivity`'s file read) for surfacing
 * in-flight progress signals from a run's JSONL log file. Issue #131:
 * `vp-dev status` was too thin for "what is the run doing right now?" —
 * operators kept writing one-off `python3 -c '...'` scripts against
 * `logs/<runId>.jsonl` to count tool calls per agent, find the most
 * recent activity per issue, and tail the recent-events stream. This
 * module replaces those scripts with one structured loader the formatter
 * consumes.
 *
 * Schema-stable: depends only on `event`, `ts`, `issueId`, `tool`,
 * `input`, and `preview` field names from `src/agent/codingAgent.ts`'s
 * `agent.tool_use` / `agent.message` / `agent.completed` / `agent.spawned`
 * events. Other event types (orchestrator-level, permission, dry-run
 * intercepts) are folded into the recent-events tail when relevant but
 * not aggregated per-issue.
 */

export interface IssueActivity {
  /** Tool-name -> call count, summed across the run. */
  toolCounts: Record<string, number>;
  /** Sum of values in `toolCounts`. Convenience for the formatter. */
  totalToolCalls: number;
  /** ISO-8601 timestamp of the most recent event observed for this issue. */
  lastEventTs?: string;
  /**
   * Short human-readable summary of the most recent event — `<tool> <input>`
   * for `agent.tool_use`, the message preview for `agent.message`, or the
   * raw event name for terminal events. Truncated to ~80 chars.
   */
  lastEventDescription?: string;
}

export interface RecentEvent {
  ts: string;
  /** Numeric issue id when the event was issue-scoped; absent for run-level events. */
  issueId?: number;
  event: string;
  /** Same shape as `IssueActivity.lastEventDescription` — tool+input or message preview. */
  detail?: string;
}

export interface RunActivity {
  /** Keyed by stringified issue id (matches RunState.issues key shape). */
  byIssue: Record<string, IssueActivity>;
  /** Last N events in chronological order (oldest → newest). */
  recentEvents: RecentEvent[];
}

interface ParsedLogLine {
  ts?: string;
  event?: string;
  issueId?: number;
  tool?: string;
  input?: string;
  preview?: string;
}

const RECENT_EVENT_DEFAULT_LIMIT = 8;
const DESCRIPTION_MAX = 80;

/**
 * Event types kept in the recent-events tail. The orchestrator + permission
 * + dry-run-intercept families are intentionally excluded — operators
 * asking "what is the agent doing right now?" want to see edits, reads,
 * Bashes, and message previews, not gate evaluations or tick proposals.
 * `agent.completed` / `agent.spawned` are kept so terminal/start markers
 * still surface in the tail.
 */
const TAIL_RELEVANT_EVENTS = new Set([
  "agent.tool_use",
  "agent.message",
  "agent.completed",
  "agent.spawned",
]);

export function emptyRunActivity(): RunActivity {
  return { byIssue: {}, recentEvents: [] };
}

/**
 * Default JSONL log path for a given runId. Matches the path computation
 * in `Logger`'s constructor (`<cwd>/logs/<runId>.jsonl`). Exported so
 * `cmdStatus` can resolve the same path the run wrote to without
 * instantiating a Logger (which opens a write stream as a side effect).
 */
export function defaultRunLogPath(runId: string, baseDir: string = process.cwd()): string {
  return path.join(baseDir, "logs", `${runId}.jsonl`);
}

/**
 * Parse a JSONL buffer and return aggregated activity. Pure; no clock,
 * no I/O. Malformed lines are silently skipped (a partial trailing line
 * during a live tail is the most common cause).
 */
export function parseRunActivity(opts: {
  jsonl: string;
  recentEventsLimit?: number;
}): RunActivity {
  const limit = opts.recentEventsLimit ?? RECENT_EVENT_DEFAULT_LIMIT;
  const byIssue: Record<string, IssueActivity> = {};
  const tail: RecentEvent[] = [];

  for (const rawLine of opts.jsonl.split(/\n/)) {
    if (!rawLine.trim()) continue;
    let line: ParsedLogLine;
    try {
      line = JSON.parse(rawLine) as ParsedLogLine;
    } catch {
      continue;
    }
    const event = line.event;
    const ts = line.ts;
    if (typeof event !== "string" || typeof ts !== "string") continue;

    const issueId = typeof line.issueId === "number" ? line.issueId : undefined;
    const description = describeEvent(event, line);

    if (issueId !== undefined) {
      const key = String(issueId);
      const ent = (byIssue[key] ??= { toolCounts: {}, totalToolCalls: 0 });
      if (event === "agent.tool_use" && typeof line.tool === "string") {
        ent.toolCounts[line.tool] = (ent.toolCounts[line.tool] ?? 0) + 1;
        ent.totalToolCalls += 1;
      }
      // Track the most recent ts for any event that touches this issue —
      // not just agent.tool_use — so `lastEventTs` stays current even
      // during the message-only stretches between tool calls.
      if (!ent.lastEventTs || ts > ent.lastEventTs) {
        ent.lastEventTs = ts;
        ent.lastEventDescription = description;
      }
    }

    if (TAIL_RELEVANT_EVENTS.has(event)) {
      tail.push({ ts, issueId, event, detail: description });
    }
  }

  // Defensive sort: events are written in append order, but a malformed
  // ts somewhere in the file shouldn't scramble the tail. ISO-8601
  // strings sort chronologically as plain strings.
  tail.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const recentEvents = tail.slice(-limit);

  return { byIssue, recentEvents };
}

/**
 * Disk wrapper around `parseRunActivity`. Returns empty activity when
 * the log file doesn't exist yet — fresh runs may not have logged any
 * events at the moment `vp-dev status` is invoked, and older runs may
 * have had their logs pruned. Other I/O errors propagate.
 */
export async function loadRunActivity(opts: {
  logPath: string;
  recentEventsLimit?: number;
}): Promise<RunActivity> {
  let jsonl: string;
  try {
    jsonl = await fs.readFile(opts.logPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyRunActivity();
    }
    throw err;
  }
  return parseRunActivity({ jsonl, recentEventsLimit: opts.recentEventsLimit });
}

/**
 * Render an ISO-8601 timestamp as a short "Xs ago" / "Xm Ys ago" /
 * "Xh Ym ago" string relative to `now`. Used by the formatter for the
 * "last activity: 12s ago" annotation per in-flight issue. Returns
 * undefined for unparseable input rather than throwing.
 */
export function formatTimeSince(ts: string | undefined, now: Date): string | undefined {
  if (!ts) return undefined;
  const ms = now.getTime() - Date.parse(ts);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s ago`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return s > 0 ? `${m}m${s}s ago` : `${m}m ago`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h${remM}m ago` : `${h}h ago`;
}

function describeEvent(event: string, line: ParsedLogLine): string | undefined {
  if (event === "agent.tool_use") {
    const tool = line.tool;
    if (typeof tool !== "string") return undefined;
    const detail = typeof line.input === "string" && line.input.length > 0 ? `${tool} ${line.input}` : tool;
    return truncate(detail, DESCRIPTION_MAX);
  }
  if (event === "agent.message") {
    return typeof line.preview === "string" ? truncate(line.preview, DESCRIPTION_MAX) : undefined;
  }
  if (event === "agent.completed") return "completed";
  if (event === "agent.spawned") return "spawned";
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}
