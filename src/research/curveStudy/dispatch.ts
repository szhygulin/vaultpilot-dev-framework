import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

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
  /** Optional progress callback fired on each cell start/done. */
  onEvent?: (e: DispatchEvent) => void;
}

export type DispatchEvent =
  | { kind: "start"; cell: CellSpec; t: Date }
  | { kind: "done"; cell: CellSpec; t: Date; rc: number; logPath: string };

export interface DispatchResult {
  cell: CellSpec;
  rc: number;
  logPath: string;
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

  return new Promise<DispatchResult[]>((resolve, reject) => {
    const tryDispatch = (): void => {
      while (active < parallelism && queue.length > 0) {
        const idx = queue.findIndex((c) => !inFlightAgents.has(c.devAgentId));
        if (idx < 0) return;
        const cell = queue.splice(idx, 1)[0];
        inFlightAgents.add(cell.devAgentId);
        active += 1;
        runCell(cell, opts).then(
          (res) => {
            results.push(res);
            inFlightAgents.delete(cell.devAgentId);
            active -= 1;
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
  opts.onEvent?.({ kind: "done", cell, t: new Date(), rc, logPath });
  return { cell, rc, logPath };
}
