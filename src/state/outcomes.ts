import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { ensureDir, withFileLock } from "./locks.js";
import { STATE_DIR } from "./runState.js";
import type { RunState } from "../types.js";

const execFile = promisify(execFileCb);

export const OUTCOMES_DIR = path.join(STATE_DIR, "outcomes");

export type TerminalState = "merged" | "closed-unmerged" | "stalled";

/**
 * One JSONL record per terminal PR outcome. Persisted to
 * `state/outcomes/<agent>.jsonl`. Append-only — the polling loop dedupes
 * by (agent, targetRepo, pr) before fetching GitHub, so re-runs of
 * `pollOutcomes` are idempotent.
 *
 * `costUsd` stays `null` until #34 (cost ceilings) lands.
 */
export interface Outcome {
  agent: string;
  issue: number;
  pr: number;
  prUrl: string;
  targetRepo: string;
  terminalState: TerminalState;
  ciCycles: number | null;
  reviewerRoundtrips: number | null;
  daysOpen: number;
  costUsd: number | null;
  closedAt: string;
}

export function outcomesFilePath(agentId: string): string {
  return path.join(OUTCOMES_DIR, `${agentId}.jsonl`);
}

/** Parse `https://github.com/owner/repo/pull/123` into `{ targetRepo, pr }`.
 *  Dry-run URLs (`https://dry-run/...`) and other shapes return `null`. */
export function parsePrUrl(prUrl: string): { targetRepo: string; pr: number } | null {
  const m = prUrl.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)$/);
  if (!m) return null;
  return { targetRepo: m[1], pr: Number(m[2]) };
}

export async function appendOutcome(outcome: Outcome): Promise<void> {
  const filePath = outcomesFilePath(outcome.agent);
  await ensureDir(path.dirname(filePath));
  await withFileLock(filePath, async () => {
    await fs.appendFile(filePath, JSON.stringify(outcome) + "\n");
  });
}

export async function readOutcomes(agentId: string): Promise<Outcome[]> {
  try {
    const raw = await fs.readFile(outcomesFilePath(agentId), "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Outcome);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function listOutcomeAgents(): Promise<string[]> {
  try {
    const files = await fs.readdir(OUTCOMES_DIR);
    return files.filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(/\.jsonl$/, ""));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

interface GhPrView {
  state: string; // "OPEN" | "MERGED" | "CLOSED"
  mergedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  reviews: { state: string }[];
  statusCheckRollup: { conclusion?: string }[] | null;
}

/** Visible for testing — the polling fetcher. Returns `null` on any error
 *  (network, gh-not-installed, PR-not-found, dry-run URL, etc). */
export type FetchPrView = (targetRepo: string, pr: number) => Promise<GhPrView | null>;

const defaultFetchPrView: FetchPrView = async (targetRepo, pr) => {
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "pr",
        "view",
        String(pr),
        "--repo",
        targetRepo,
        "--json",
        "state,mergedAt,closedAt,createdAt,reviews,statusCheckRollup",
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as GhPrView;
  } catch {
    return null;
  }
};

interface PendingPr {
  agent: string;
  issue: number;
  pr: number;
  prUrl: string;
  targetRepo: string;
}

export interface PollOutcomesOpts {
  staleThresholdDays: number;
  /** Override `now` for deterministic tests / replay. Defaults to wall clock. */
  now?: Date;
  /** Override the gh fetcher for tests. */
  fetchPrView?: FetchPrView;
}

export interface PollOutcomesResult {
  appended: Outcome[];
  /** PRs that GitHub still reports as open and haven't crossed the stale threshold. */
  stillPending: number;
  /** PRs the fetcher couldn't read (network error, gone, dry-run URL we couldn't parse — though those skip earlier). */
  fetchErrors: number;
}

/**
 * Walk every `state/run-*.json` file, find issues whose `outcome` was
 * `implement` and have a parseable github.com PR URL not yet recorded,
 * fetch each PR's current state via `gh pr view`, and append a terminal
 * outcome record if the PR has merged / closed / stalled past
 * `staleThresholdDays`.
 *
 * Cheap (one `gh pr view` per non-terminal PR per `vp-dev` invocation) and
 * lazy. Failures are swallowed and reported via `result.fetchErrors`; the
 * caller never aborts a `vp-dev run` over a flaky polling step.
 */
export async function pollOutcomes(opts: PollOutcomesOpts): Promise<PollOutcomesResult> {
  const fetchPrView = opts.fetchPrView ?? defaultFetchPrView;
  const now = opts.now ?? new Date();
  const result: PollOutcomesResult = { appended: [], stillPending: 0, fetchErrors: 0 };

  const pendingPrs = await collectPendingPrs();
  for (const p of pendingPrs) {
    const view = await fetchPrView(p.targetRepo, p.pr);
    if (!view) {
      result.fetchErrors += 1;
      continue;
    }
    const outcome = computeOutcome(p, view, opts.staleThresholdDays, now);
    if (!outcome) {
      result.stillPending += 1;
      continue;
    }
    await appendOutcome(outcome);
    result.appended.push(outcome);
  }
  return result;
}

function computeOutcome(
  p: PendingPr,
  view: GhPrView,
  staleDays: number,
  now: Date,
): Outcome | null {
  const created = new Date(view.createdAt);
  const stateUp = (view.state ?? "").toUpperCase();
  let terminalState: TerminalState | null = null;
  let closedAt: string | null = null;

  if (stateUp === "MERGED") {
    terminalState = "merged";
    closedAt = view.mergedAt ?? view.closedAt ?? now.toISOString();
  } else if (stateUp === "CLOSED") {
    terminalState = "closed-unmerged";
    closedAt = view.closedAt ?? now.toISOString();
  } else {
    const daysOpenLive = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOpenLive > staleDays) {
      terminalState = "stalled";
      closedAt = now.toISOString();
    } else {
      return null;
    }
  }

  const closedDate = new Date(closedAt);
  const daysOpen =
    Math.round(
      ((closedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)) * 10,
    ) / 10;

  const ciCycles = view.statusCheckRollup
    ? view.statusCheckRollup.filter(
        (c) => (c.conclusion ?? "").toUpperCase() === "FAILURE",
      ).length
    : null;
  const reviewerRoundtrips = Array.isArray(view.reviews)
    ? view.reviews.filter((r) => r.state === "CHANGES_REQUESTED").length
    : null;

  return {
    agent: p.agent,
    issue: p.issue,
    pr: p.pr,
    prUrl: p.prUrl,
    targetRepo: p.targetRepo,
    terminalState,
    ciCycles,
    reviewerRoundtrips,
    daysOpen: Math.max(0, daysOpen),
    costUsd: null,
    closedAt,
  };
}

async function collectPendingPrs(): Promise<PendingPr[]> {
  const recorded = await loadRecordedPrSet();
  const seen = new Set<string>();
  const pending: PendingPr[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(STATE_DIR);
  } catch {
    return pending;
  }
  for (const name of entries) {
    if (!name.startsWith("run-") || !name.endsWith(".json")) continue;
    const filePath = path.join(STATE_DIR, name);
    let state: RunState;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      state = JSON.parse(raw) as RunState;
    } catch {
      continue;
    }
    for (const [issueIdStr, entry] of Object.entries(state.issues)) {
      if (entry.outcome !== "implement") continue;
      if (!entry.prUrl || !entry.agentId) continue;
      const parsed = parsePrUrl(entry.prUrl);
      if (!parsed) continue; // dry-run URL, malformed link, etc.
      const issueId = Number(issueIdStr);
      const key = pendingKey(entry.agentId, parsed.targetRepo, parsed.pr);
      if (recorded.has(key) || seen.has(key)) continue;
      seen.add(key);
      pending.push({
        agent: entry.agentId,
        issue: issueId,
        pr: parsed.pr,
        prUrl: entry.prUrl,
        targetRepo: parsed.targetRepo,
      });
    }
  }
  return pending;
}

function pendingKey(agent: string, targetRepo: string, pr: number): string {
  return `${agent}|${targetRepo}|${pr}`;
}

async function loadRecordedPrSet(): Promise<Set<string>> {
  const set = new Set<string>();
  const agents = await listOutcomeAgents();
  for (const agentId of agents) {
    const outcomes = await readOutcomes(agentId);
    for (const o of outcomes) set.add(pendingKey(o.agent, o.targetRepo, o.pr));
  }
  return set;
}

/** Per-agent rollup over `state/outcomes/<agent>.jsonl`. */
export interface AgentStats {
  agentId: string;
  runs: number;
  merged: number;
  closedUnmerged: number;
  stalled: number;
  mergeRate: number; // 0..1
  medianRework: number | null;
  costPerMerge: number | null;
}

export function rollupOutcomes(outcomes: Outcome[]): Omit<AgentStats, "agentId"> {
  const runs = outcomes.length;
  let merged = 0;
  let closedUnmerged = 0;
  let stalled = 0;
  const reworks: number[] = [];
  let totalCost = 0;
  let costSamples = 0;
  for (const o of outcomes) {
    if (o.terminalState === "merged") merged += 1;
    else if (o.terminalState === "closed-unmerged") closedUnmerged += 1;
    else if (o.terminalState === "stalled") stalled += 1;
    const rework = (o.ciCycles ?? 0) + (o.reviewerRoundtrips ?? 0);
    if (o.ciCycles != null || o.reviewerRoundtrips != null) reworks.push(rework);
    if (o.costUsd != null) {
      totalCost += o.costUsd;
      costSamples += 1;
    }
  }
  return {
    runs,
    merged,
    closedUnmerged,
    stalled,
    mergeRate: runs === 0 ? 0 : merged / runs,
    medianRework: median(reworks),
    costPerMerge: merged === 0 || costSamples === 0 ? null : totalCost / merged,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export async function loadAllAgentStats(): Promise<AgentStats[]> {
  const agents = await listOutcomeAgents();
  const out: AgentStats[] = [];
  for (const agentId of agents) {
    const outcomes = await readOutcomes(agentId);
    out.push({ agentId, ...rollupOutcomes(outcomes) });
  }
  return out;
}
