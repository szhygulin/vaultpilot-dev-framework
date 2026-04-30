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

export function newRunState(opts: {
  runId: string;
  targetRepo: string;
  issueRange: IssueRangeSpec;
  parallelism: number;
  issueIds: number[];
  dryRun: boolean;
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
  };
}

export function isRunComplete(state: RunState): boolean {
  for (const entry of Object.values(state.issues)) {
    if (entry.status !== "done" && entry.status !== "failed") return false;
  }
  return true;
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
