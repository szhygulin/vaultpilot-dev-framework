// Dispatch for the specialist-pick benchmark (#179 experiment 2).
//
// For each of N issues, we:
//   1. Fetch the issue's labels via `gh issue view`.
//   2. Call `pickAgents` (orchestrator's library function — pure, no I/O)
//      with the issue + the live registry to get the top-fit specialist.
//   3. Shell out `vp-dev spawn --agent <picked> --issue <N> --dry-run
//      --no-target-claude-md --issue-body-only --skip-summary` K times,
//      each producing a separate log file tagged with replicate index.
//
// We invoke `vp-dev spawn` (not `vp-dev run`) to bypass orchestration
// overhead and the approval gate. `spawn` directly runs ONE agent on
// ONE issue. The picker is used as a library to mint the agent ID;
// dispatch is per-cell.

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { pickAgents } from "../../orchestrator/orchestrator.js";
import { loadRegistry } from "../../state/registry.js";
import type { AgentRegistryFile, IssueSummary } from "../../types.js";

const execFile = promisify(execFileCb);

export interface BenchCellSpec {
  issueId: number;
  pickedAgentId: string;
  replicate: number;
  targetRepo: string;
  /** `cwd` for the spawn call (the dedicated clone of the target repo). */
  clonePath: string;
}

export interface BenchDispatchInput {
  /** Issues to dispatch (will be sorted ascending). */
  issueIds: ReadonlyArray<number>;
  targetRepo: string;
  /** Path to a fresh clone of the target repo (one suffices — spawn dry-run-mode side-effects don't touch the worktree). */
  clonePath: string;
  /** K replicates per issue. Default 3. */
  replicates?: number;
  /** Where per-cell logs land. */
  logsDir: string;
  /** Working directory for the orchestrator commands (this repo's root, with state/, dist/). */
  cwd: string;
  /** Cumulative cost cap across all cells. Aborts further dispatches when reached. */
  maxTotalCostUsd?: number;
  /** Override `gh issue view` shell-out (tests pass a synthetic fetcher). */
  fetchIssueLabels?: (issueId: number, targetRepo: string) => Promise<string[]>;
  /** Override the spawn shell-out (tests pass a synthetic dispatcher). */
  spawnCell?: (spec: BenchCellSpec, logPath: string) => Promise<{ rc: number }>;
  /** Override the registry source (tests pass a synthetic registry; production calls loadRegistry()). */
  regOverride?: AgentRegistryFile;
  /** Optional progress callback (used by the CLI for live status). */
  onEvent?: (event: BenchDispatchEvent) => void;
}

export type BenchDispatchEvent =
  | { kind: "pick"; issueId: number; pickedAgentId: string; t: Date }
  | { kind: "start"; spec: BenchCellSpec; t: Date }
  | { kind: "done"; spec: BenchCellSpec; rc: number; t: Date }
  | { kind: "budget-exhausted"; usdSoFar: number; t: Date };

export interface BenchDispatchOutcome {
  picks: ReadonlyArray<{ issueId: number; pickedAgentId: string; pickedAgentScore: number }>;
  cells: ReadonlyArray<{ spec: BenchCellSpec; logPath: string; rc: number }>;
  budgetExhausted: boolean;
}

const DEFAULT_REPLICATES = 3;

/**
 * Run the benchmark. For each issue, picker chooses the top-fit
 * specialist; that specialist runs the issue K times. Per-cell logs
 * land in `logsDir` with filename
 * `bench-r{N}-<agentId>-<issueId>.log`.
 *
 * Caller is responsible for archiving the trim agents BEFORE calling so
 * the picker doesn't see them as candidates (see plan §"Trim
 * contamination"). The orchestrator's `pickAgents` already skips
 * archived agents (`a.archived === true`).
 */
export async function runBenchDispatch(
  input: BenchDispatchInput,
): Promise<BenchDispatchOutcome> {
  const replicates = input.replicates ?? DEFAULT_REPLICATES;
  const fetchLabels = input.fetchIssueLabels ?? defaultFetchIssueLabels;
  const spawnCell = input.spawnCell ?? defaultSpawnCell;

  await fs.mkdir(input.logsDir, { recursive: true });

  // 1. Pick a specialist per issue (library call to pickAgents — no I/O).
  const reg = input.regOverride ?? (await loadRegistry());
  const picks: Array<{ issueId: number; pickedAgentId: string; pickedAgentScore: number }> = [];
  const sortedIssues = [...input.issueIds].sort((a, b) => a - b);
  for (const issueId of sortedIssues) {
    const labels = await fetchLabels(issueId, input.targetRepo);
    const issue: IssueSummary = {
      id: issueId,
      title: "", // pickAgents doesn't use title — Jaccard is on labels
      labels,
      state: "open",
    };
    const pickResult = pickAgents({
      reg,
      pendingIssues: [issue],
      maxParallelism: 1,
    });
    if (pickResult.reusedAgents.length === 0) {
      throw new Error(
        `pickAgents returned no candidates for issue #${issueId} — is the registry empty? Are all agents archived?`,
      );
    }
    const picked = pickResult.reusedAgents[0];
    picks.push({
      issueId,
      pickedAgentId: picked.agent.agentId,
      pickedAgentScore: picked.score,
    });
    input.onEvent?.({ kind: "pick", issueId, pickedAgentId: picked.agent.agentId, t: new Date() });
  }

  // 2. For each (issue, replicate) dispatch one cell.
  const cells: Array<{ spec: BenchCellSpec; logPath: string; rc: number }> = [];
  let totalUsd = 0;
  let budgetExhausted = false;
  for (const pick of picks) {
    for (let r = 1; r <= replicates; r++) {
      if (input.maxTotalCostUsd !== undefined && totalUsd >= input.maxTotalCostUsd) {
        input.onEvent?.({ kind: "budget-exhausted", usdSoFar: totalUsd, t: new Date() });
        budgetExhausted = true;
        break;
      }
      const spec: BenchCellSpec = {
        issueId: pick.issueId,
        pickedAgentId: pick.pickedAgentId,
        replicate: r,
        targetRepo: input.targetRepo,
        clonePath: input.clonePath,
      };
      const logPath = path.join(
        input.logsDir,
        `bench-r${r}-${pick.pickedAgentId}-${pick.issueId}.log`,
      );
      input.onEvent?.({ kind: "start", spec, t: new Date() });
      const { rc } = await spawnCell(spec, logPath);
      cells.push({ spec, logPath, rc });
      input.onEvent?.({ kind: "done", spec, rc, t: new Date() });
      // Best-effort cost tracking from the log (the spawn writes a JSON
      // envelope with `costUsd`; we re-read here to update totalUsd).
      try {
        const text = await fs.readFile(logPath, "utf-8");
        const m = text.match(/"costUsd"\s*:\s*([0-9.]+)/);
        if (m) totalUsd += Number(m[1]);
      } catch {
        // log read failed; budget tracking stays approximate
      }
    }
    if (budgetExhausted) break;
  }

  return { picks, cells, budgetExhausted };
}

// ---------------------------------------------------------------------
// Default shell-out implementations
// ---------------------------------------------------------------------

async function defaultFetchIssueLabels(
  issueId: number,
  targetRepo: string,
): Promise<string[]> {
  const { stdout } = await execFile("gh", [
    "issue",
    "view",
    String(issueId),
    "--repo",
    targetRepo,
    "--json",
    "labels",
  ]);
  const parsed = JSON.parse(stdout) as { labels: Array<{ name: string }> };
  return parsed.labels.map((l) => l.name);
}

async function defaultSpawnCell(
  spec: BenchCellSpec,
  logPath: string,
): Promise<{ rc: number }> {
  const args = [
    "run",
    "vp-dev",
    "--",
    "spawn",
    "--agent",
    spec.pickedAgentId,
    "--issue",
    String(spec.issueId),
    "--target-repo",
    spec.targetRepo,
    "--target-repo-path",
    spec.clonePath,
    "--skip-summary",
    "--dry-run",
    "--no-target-claude-md",
    "--issue-body-only",
  ];
  const out = await fs.open(logPath, "w");
  return new Promise<{ rc: number }>((resolve, reject) => {
    const child = spawn("npm", args, {
      stdio: ["ignore", out.fd, out.fd],
    });
    child.on("error", (err) => {
      out.close().catch(() => {});
      reject(err);
    });
    child.on("close", async (code) => {
      await out.close();
      resolve({ rc: code ?? 0 });
    });
  });
}
