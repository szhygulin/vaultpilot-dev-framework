import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, withFileLock } from "./locks.js";
import type { RunState, RunIssueEntry, IssueRangeSpec } from "../types.js";

export const STATE_DIR = path.resolve(process.cwd(), "state");
const CURRENT_RUN_FILE = path.join(STATE_DIR, "current-run.txt");

export function runFilePath(runId: string): string {
  return path.join(STATE_DIR, `${runId}.json`);
}

export function makeRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
  return `run-${ts}`;
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filePath);
}

export async function loadRunState(runId: string): Promise<RunState> {
  const raw = await fs.readFile(runFilePath(runId), "utf-8");
  return JSON.parse(raw) as RunState;
}

export async function saveRunState(state: RunState): Promise<void> {
  const filePath = runFilePath(state.runId);
  await withFileLock(filePath, async () => {
    await atomicWriteJson(filePath, state);
  });
}

export async function readCurrentRunId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(CURRENT_RUN_FILE, "utf-8");
    const id = raw.trim();
    return id.length > 0 ? id : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeCurrentRunId(runId: string): Promise<void> {
  await ensureDir(STATE_DIR);
  const tmp = `${CURRENT_RUN_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${runId}\n`);
  await fs.rename(tmp, CURRENT_RUN_FILE);
}

export async function clearCurrentRunId(): Promise<void> {
  await fs.rm(CURRENT_RUN_FILE, { force: true });
}

/**
 * Return the most recent `run-<ISO>.json` runId on disk, or null if none.
 * `state/` is gitignored and run files are named with their ISO start
 * timestamps — lexicographic sort = chronological order. Used by
 * `vp-dev status --latest` to inspect the most recent run regardless of
 * whether `current-run.txt` was cleared on completion.
 */
export async function findLatestRunId(): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(STATE_DIR);
  } catch {
    return null;
  }
  return pickLatestRunIdFromEntries(entries);
}

// Run-state files match `run-<ISO-timestamp>.json` (per `makeRunId`'s
// `toISOString().replace(/[:.]/g, "-")`). The anchored regex is what
// keeps `run-confirm-<token>.json` (and any future `run-*-<x>.json`
// kinds) out of the latest-run picker — `startsWith("run-")` was too
// loose, lex-sorted `run-confirm-*` ahead of real runs, and crashed
// `formatStatusText` on a confirm-token's RunConfirmToken shape (#125).
const RUN_STATE_FILE_RE = /^run-\d{4}-\d{2}-\d{2}T.*\.json$/;

export function pickLatestRunIdFromEntries(entries: string[]): string | null {
  const runFiles = entries.filter((e) => RUN_STATE_FILE_RE.test(e)).sort();
  if (runFiles.length === 0) return null;
  return runFiles[runFiles.length - 1].replace(/\.json$/, "");
}

export function newRunState(opts: {
  runId: string;
  targetRepo: string;
  issueRange: IssueRangeSpec;
  parallelism: number;
  issueIds: number[];
  dryRun: boolean;
  maxCostUsd?: number;
}): RunState {
  const issues: Record<string, RunIssueEntry> = {};
  for (const id of opts.issueIds) {
    issues[String(id)] = { status: "pending" };
  }
  const now = new Date().toISOString();
  return {
    runId: opts.runId,
    targetRepo: opts.targetRepo,
    issueRange: opts.issueRange,
    parallelism: opts.parallelism,
    agents: [],
    issues,
    tickCount: 0,
    lastTickAt: now,
    startedAt: now,
    dryRun: opts.dryRun,
    ...(opts.maxCostUsd !== undefined ? { maxCostUsd: opts.maxCostUsd } : {}),
  };
}

// Terminal statuses for completion checks: `done`, `failed`, and (since #86)
// `aborted-budget`. The orchestrator's `runOrchestrator` loop exits when
// `isRunComplete` returns true, so adding `aborted-budget` here is what lets
// the run wind down after the cost ceiling is crossed.
export function isRunComplete(state: RunState): boolean {
  for (const entry of Object.values(state.issues)) {
    if (
      entry.status !== "done" &&
      entry.status !== "failed" &&
      entry.status !== "aborted-budget"
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Mark a single pending issue as `aborted-budget` — the per-run cost ceiling
 * (#86) was crossed and the orchestrator stopped dispatching. Parallel to
 * `markFailed` in shape: writes the issue entry with `outcome: "error"` so
 * any consumer that filters by `outcome` continues to see this as a
 * non-success path, but the `status` distinguishes "operator policy abort"
 * from "coding agent crashed".
 *
 * Idempotent on already-terminal issues: if `status` is already `done`,
 * `failed`, or `aborted-budget`, leaves the entry untouched. Only flips
 * `pending` (and defensively `in-flight`, though the orchestrator avoids
 * that path) to `aborted-budget`.
 */
export function markAborted(state: RunState, issueId: number): void {
  const key = String(issueId);
  const existing = state.issues[key];
  if (!existing) return;
  if (
    existing.status === "done" ||
    existing.status === "failed" ||
    existing.status === "aborted-budget"
  ) {
    return;
  }
  state.issues[key] = {
    status: "aborted-budget",
    agentId: existing.agentId,
    outcome: "error",
    error: "aborted-budget: per-run cost ceiling exceeded",
  };
}

export function pendingIssueIds(state: RunState): number[] {
  return Object.entries(state.issues)
    .filter(([, entry]) => entry.status === "pending")
    .map(([id]) => Number(id));
}

export function inFlightIssueIds(state: RunState): number[] {
  return Object.entries(state.issues)
    .filter(([, entry]) => entry.status === "in-flight")
    .map(([id]) => Number(id));
}

export function downgradeInFlightToPending(state: RunState): void {
  for (const [id, entry] of Object.entries(state.issues)) {
    if (entry.status === "in-flight") {
      state.issues[id] = { status: "pending" };
    }
  }
  for (const a of state.agents) a.status = "idle";
}
