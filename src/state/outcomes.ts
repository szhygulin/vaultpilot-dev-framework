import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "./locks.js";
import { STATE_DIR, loadRunState } from "./runState.js";
import { loadRegistry } from "./registry.js";
import { prState, type GhPrState } from "../github/gh.js";
import type { RunState } from "../types.js";

export const OUTCOMES_DIR = path.join(STATE_DIR, "outcomes");

export type TerminalState = "merged" | "closed-unmerged" | "stalled";

export interface Outcome {
  agent: string;
  issue: number;
  pr: number;
  targetRepo: string;
  terminalState: TerminalState;
  ciCycles: number;
  reviewerRoundtrips: number;
  daysOpen: number;
  closedAt: string;
}

export function outcomesFilePath(agentId: string): string {
  return path.join(OUTCOMES_DIR, `${agentId}.jsonl`);
}

export async function loadOutcomes(agentId: string): Promise<Outcome[]> {
  const filePath = outcomesFilePath(agentId);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Outcome[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as Outcome);
    } catch {
      // Skip malformed lines — append-only file may have a partial last line
      // if a previous write was interrupted; ignore rather than fail polling.
    }
  }
  return out;
}

export async function appendOutcome(agentId: string, outcome: Outcome): Promise<void> {
  const filePath = outcomesFilePath(agentId);
  await ensureDir(path.dirname(filePath));
  await withFileLock(filePath, async () => {
    await fs.appendFile(filePath, JSON.stringify(outcome) + "\n");
  });
}

/**
 * Walks past run state files for any PR that landed via an `implement`
 * envelope, fetches its current GitHub state, and appends a terminal
 * outcome record once the PR is merged / closed-unmerged / stalled.
 *
 * Idempotent: skips PRs already recorded in `state/outcomes/<agentId>.jsonl`.
 */
export interface PollOutcomesInput {
  staleThresholdDays: number;
  /** Optional: warn handler for transient gh failures. Default: silent. */
  onWarn?: (msg: string) => void;
}

export interface PollOutcomesResult {
  appended: Outcome[];
  /** PRs polled that are still in a non-terminal, non-stalled state. */
  pendingPrs: number;
  /** Polling errors (network, gh CLI). */
  errors: number;
}

export async function pollOutcomes(input: PollOutcomesInput): Promise<PollOutcomesResult> {
  const candidates = await collectCandidatePrs();
  if (candidates.length === 0) return { appended: [], pendingPrs: 0, errors: 0 };

  const appended: Outcome[] = [];
  let pendingPrs = 0;
  let errors = 0;

  // Build per-agent skip-set up front (one read per agent that has any
  // candidate). Cheap; avoids rereading the JSONL inside the loop.
  const skipByAgent = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (skipByAgent.has(c.agentId)) continue;
    const existing = await loadOutcomes(c.agentId);
    skipByAgent.set(
      c.agentId,
      new Set(existing.map((o) => `${o.targetRepo}#${o.pr}`)),
    );
  }

  for (const c of candidates) {
    const key = `${c.targetRepo}#${c.prNumber}`;
    if (skipByAgent.get(c.agentId)?.has(key)) continue;

    let live: GhPrState | null;
    try {
      live = await prState(c.targetRepo, c.prNumber);
    } catch (err) {
      errors += 1;
      input.onWarn?.(`pollOutcomes: gh pr view failed for ${key}: ${(err as Error).message}`);
      continue;
    }
    if (!live) {
      errors += 1;
      input.onWarn?.(`pollOutcomes: PR ${key} not found`);
      continue;
    }

    const outcome = deriveOutcome({
      agentId: c.agentId,
      issueId: c.issueId,
      prNumber: c.prNumber,
      targetRepo: c.targetRepo,
      live,
      staleThresholdDays: input.staleThresholdDays,
    });
    if (!outcome) {
      pendingPrs += 1;
      continue;
    }

    await appendOutcome(c.agentId, outcome);
    skipByAgent.get(c.agentId)?.add(key);
    appended.push(outcome);
  }

  return { appended, pendingPrs, errors };
}

/** Internal: every PR found across past runs (one entry per merged-or-not). */
interface PrCandidate {
  agentId: string;
  issueId: number;
  prNumber: number;
  targetRepo: string;
}

async function collectCandidatePrs(): Promise<PrCandidate[]> {
  // Limit scan to runs the registry knows about — read all `state/run-*.json`
  // and collect every issue entry with an implement decision and a parsable
  // PR URL. Walks the directory once; cheap.
  const reg = await loadRegistry();
  const knownAgents = new Set(reg.agents.map((a) => a.agentId));

  let entries: string[];
  try {
    entries = await fs.readdir(STATE_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const out: PrCandidate[] = [];
  for (const name of entries) {
    if (!name.startsWith("run-") || !name.endsWith(".json")) continue;
    const runId = name.slice(0, -".json".length);
    let state: RunState;
    try {
      state = await loadRunState(runId);
    } catch {
      continue;
    }
    for (const [issueIdStr, entry] of Object.entries(state.issues)) {
      if (entry.outcome !== "implement") continue;
      if (!entry.agentId || !entry.prUrl) continue;
      if (!knownAgents.has(entry.agentId)) continue;
      const prNumber = parsePrNumber(entry.prUrl);
      if (prNumber == null) continue;
      out.push({
        agentId: entry.agentId,
        issueId: Number(issueIdStr),
        prNumber,
        targetRepo: state.targetRepo,
      });
    }
  }
  return out;
}

function parsePrNumber(url: string): number | null {
  // Accept https://github.com/<owner>/<repo>/pull/<N>(#... or trailing)
  const m = url.match(/\/pull\/(\d+)(?:[/#?]|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface DeriveInput {
  agentId: string;
  issueId: number;
  prNumber: number;
  targetRepo: string;
  live: GhPrState;
  staleThresholdDays: number;
}

/**
 * Returns null when the PR is still open and below the stale threshold —
 * keep polling next time. Returns an Outcome when terminal (merged, closed
 * without merge, or stalled past the threshold).
 */
export function deriveOutcome(input: DeriveInput): Outcome | null {
  const { live } = input;
  const ciCycles = countCiFailures(live.statusCheckRollup);
  const reviewerRoundtrips = countChangesRequested(live.reviews);
  const created = Date.parse(live.createdAt);

  if (live.state === "MERGED" && live.mergedAt) {
    return {
      agent: input.agentId,
      issue: input.issueId,
      pr: input.prNumber,
      targetRepo: input.targetRepo,
      terminalState: "merged",
      ciCycles,
      reviewerRoundtrips,
      daysOpen: daysBetween(created, Date.parse(live.mergedAt)),
      closedAt: live.mergedAt,
    };
  }

  if (live.state === "CLOSED" && live.closedAt) {
    return {
      agent: input.agentId,
      issue: input.issueId,
      pr: input.prNumber,
      targetRepo: input.targetRepo,
      terminalState: "closed-unmerged",
      ciCycles,
      reviewerRoundtrips,
      daysOpen: daysBetween(created, Date.parse(live.closedAt)),
      closedAt: live.closedAt,
    };
  }

  // Open. Check stale threshold.
  const now = Date.now();
  const ageDays = daysBetween(created, now);
  if (ageDays >= input.staleThresholdDays) {
    return {
      agent: input.agentId,
      issue: input.issueId,
      pr: input.prNumber,
      targetRepo: input.targetRepo,
      terminalState: "stalled",
      ciCycles,
      reviewerRoundtrips,
      daysOpen: ageDays,
      closedAt: new Date(now).toISOString(),
    };
  }
  return null;
}

function countCiFailures(rollup: GhPrState["statusCheckRollup"]): number {
  if (!Array.isArray(rollup)) return 0;
  let n = 0;
  for (const r of rollup) {
    if (typeof r?.conclusion === "string" && r.conclusion.toUpperCase() === "FAILURE") n += 1;
  }
  return n;
}

function countChangesRequested(reviews: GhPrState["reviews"]): number {
  if (!Array.isArray(reviews)) return 0;
  let n = 0;
  for (const r of reviews) {
    if (typeof r?.state === "string" && r.state.toUpperCase() === "CHANGES_REQUESTED") n += 1;
  }
  return n;
}

function daysBetween(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)));
}

/** Aggregated per-agent rollup for `vp-dev agents stats`. */
export interface AgentRollup {
  agentId: string;
  name?: string;
  runs: number;
  merged: number;
  closedUnmerged: number;
  stalled: number;
  mergeRate: number; // 0..1
  medianRework: number;
  medianCiCycles: number;
}

export async function loadAllOutcomes(agentIds: string[]): Promise<Map<string, Outcome[]>> {
  const out = new Map<string, Outcome[]>();
  for (const id of agentIds) {
    out.set(id, await loadOutcomes(id));
  }
  return out;
}

export function rollupOutcomes(opts: {
  agentId: string;
  name?: string;
  outcomes: Outcome[];
}): AgentRollup {
  const runs = opts.outcomes.length;
  const merged = opts.outcomes.filter((o) => o.terminalState === "merged").length;
  const closedUnmerged = opts.outcomes.filter((o) => o.terminalState === "closed-unmerged").length;
  const stalled = opts.outcomes.filter((o) => o.terminalState === "stalled").length;
  return {
    agentId: opts.agentId,
    name: opts.name,
    runs,
    merged,
    closedUnmerged,
    stalled,
    mergeRate: runs === 0 ? 0 : merged / runs,
    medianRework: median(opts.outcomes.map((o) => o.reviewerRoundtrips)),
    medianCiCycles: median(opts.outcomes.map((o) => o.ciCycles)),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
