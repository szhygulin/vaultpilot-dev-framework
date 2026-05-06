import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractEnvelope } from "./aggregate.js";

/**
 * Per-cell dispatch input. The (devAgentId, issueId) tuple becomes one
 * research-agent run; clonePath is the dev-agent's dedicated target-repo
 * clone (each dev-agent has its own to prevent cross-cell worktree races).
 */
export interface CellSpec {
  devAgentId: string;
  issueId: number;
  clonePath: string;
}

export interface DispatchOptions {
  cells: CellSpec[];
  /** Owner/repo on GitHub (e.g. "szhygulin/vaultpilot-mcp-smoke-test"). */
  targetRepo: string;
  /** Max concurrent research agents. Default 4. */
  parallelism?: number;
  /** Where per-cell logs land. Each cell writes "<logsDir>/<prefix><agent>-<issue>.log". */
  logsDir: string;
  logPrefix: string;
  /** Pass --dry-run to vp-dev spawn (intercepts push/PR side effects). */
  dryRun?: boolean;
  /** Working directory of the vp-dev binary (where node + npm find dist/). */
  cwd: string;
  /**
   * Pass --allow-closed-issue to vp-dev spawn, enabling dispatch against
   * closed-completed issues (used as ground-truth controls in the curve study).
   */
  allowClosedIssue?: boolean;
  /**
   * Pass --issue-body-only to vp-dev spawn — Step 1 fetches the issue
   * body only, no comments. Required for closed-issue dispatches so the
   * resolution-PR link doesn't leak.
   */
  issueBodyOnly?: boolean;
  /**
   * Pass --no-target-claude-md to vp-dev spawn — suppress the live
   * target-repo CLAUDE.md prepend so the effective context size matches
   * the per-agent CLAUDE.md size we're varying.
   */
  suppressTargetClaudeMd?: boolean;
  /** Optional progress callback fired on each cell start/done. */
  onEvent?: (e: DispatchEvent) => void;
  /**
   * Optional cumulative cost cap (USD) across all cells in the dispatch.
   * When the rolling cost exceeds this cap, no further cells are spawned
   * and dispatchCells resolves with the partial result list.
   */
  maxTotalCostUsd?: number;
}

export type DispatchEvent =
  | { kind: "start"; cell: CellSpec; t: Date }
  | { kind: "done"; cell: CellSpec; t: Date; rc: number; logPath: string };

export interface DispatchResult {
  cell: CellSpec;
  rc: number;
  logPath: string;
  /** Parsed costUsd from the spawn log envelope, when present. */
  costUsd?: number;
}

/**
 * Run all cells with at most `parallelism` running concurrently, and at most
 * one cell per devAgent at a time (per-agent serialization protects each
 * dev-agent's dedicated clone from worktree races). The phase-1 study's
 * dominant failure mode was 10-way parallel dispatch racing within shared
 * clones; this routine is the architectural fix.
 */
export async function dispatchCells(opts: DispatchOptions): Promise<DispatchResult[]> {
  await fs.mkdir(opts.logsDir, { recursive: true });
  const parallelism = opts.parallelism ?? 4;
  const cellsByAgent = new Map<string, CellSpec[]>();
  for (const c of opts.cells) {
    let arr = cellsByAgent.get(c.devAgentId);
    if (!arr) {
      arr = [];
      cellsByAgent.set(c.devAgentId, arr);
    }
    arr.push(c);
  }

  const results: DispatchResult[] = [];
  const queue: CellSpec[] = [...opts.cells];
  const inFlightAgents = new Set<string>();
  let active = 0;
  let cumulativeCostUsd = 0;
  let costCapHit = false;

  return new Promise<DispatchResult[]>((resolve, reject) => {
    const tryDispatch = (): void => {
      if (costCapHit) {
        if (active === 0) resolve(results);
        return;
      }
      while (active < parallelism && queue.length > 0) {
        const idx = queue.findIndex((c) => !inFlightAgents.has(c.devAgentId));
        if (idx < 0) return;
        const cell = queue.splice(idx, 1)[0];
        inFlightAgents.add(cell.devAgentId);
        active += 1;
        runCell(cell, opts).then(
          (res) => {
            results.push(res);
            cumulativeCostUsd += res.costUsd ?? 0;
            inFlightAgents.delete(cell.devAgentId);
            active -= 1;
            if (
              opts.maxTotalCostUsd !== undefined &&
              cumulativeCostUsd >= opts.maxTotalCostUsd &&
              !costCapHit
            ) {
              costCapHit = true;
              process.stderr.write(
                `\nABORT: cumulative cost $${cumulativeCostUsd.toFixed(2)} reached cap $${opts.maxTotalCostUsd.toFixed(2)} after ${results.length}/${opts.cells.length} cells. ${queue.length} remaining cells dropped.\n`,
              );
              queue.length = 0;
            }
            if (queue.length === 0 && active === 0) {
              resolve(results);
            } else {
              tryDispatch();
            }
          },
          (err) => reject(err),
        );
      }
    };
    tryDispatch();
  });
}

async function runCell(cell: CellSpec, opts: DispatchOptions): Promise<DispatchResult> {
  opts.onEvent?.({ kind: "start", cell, t: new Date() });
  const logPath = path.join(opts.logsDir, `${opts.logPrefix}${cell.devAgentId}-${cell.issueId}.log`);
  const args = [
    "run",
    "vp-dev",
    "--",
    "spawn",
    "--agent",
    cell.devAgentId,
    "--issue",
    String(cell.issueId),
    "--target-repo",
    opts.targetRepo,
    "--target-repo-path",
    cell.clonePath,
    "--skip-summary",
  ];
  if (opts.dryRun) args.push("--dry-run");
  if (opts.allowClosedIssue) args.push("--allow-closed-issue");
  if (opts.issueBodyOnly) args.push("--issue-body-only");
  if (opts.suppressTargetClaudeMd) args.push("--no-target-claude-md");

  const out = await fs.open(logPath, "w");
  const rc = await new Promise<number>((res, rej) => {
    const child = spawn("npm", args, {
      cwd: opts.cwd,
      stdio: ["ignore", out.fd, out.fd],
    });
    child.on("error", rej);
    child.on("exit", (code) => res(code ?? 1));
  });
  await out.close();
  // Read the just-written log and pull costUsd from the envelope so the
  // cumulative-cost cap can decide whether to admit the next cell.
  let costUsd: number | undefined;
  try {
    const text = await fs.readFile(logPath, "utf8");
    const env = extractEnvelope(text) as { costUsd?: number } | null;
    if (env && typeof env.costUsd === "number") costUsd = env.costUsd;
  } catch {
    // Spawn-stub failures or unwritten logs leave costUsd undefined; the
    // cumulative-cost tracker treats undefined as zero contribution.
  }
  opts.onEvent?.({ kind: "done", cell, t: new Date(), rc, logPath });
  return { cell, rc, logPath, costUsd };
}
