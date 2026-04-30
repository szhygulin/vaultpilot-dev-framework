import { Command } from "commander";
import {
  clearCurrentRunId,
  downgradeInFlightToPending,
  isRunComplete,
  loadRunState,
  makeRunId,
  newRunState,
  readCurrentRunId,
  saveRunState,
  writeCurrentRunId,
} from "./state/runState.js";
import { loadRegistry } from "./state/registry.js";
import { parseRangeSpec, describeRange } from "./github/range.js";
import { resolveRangeToIssues } from "./github/gh.js";
import { runOrchestrator } from "./orchestrator/orchestrator.js";
import { approveSetup, buildSetupPreview } from "./orchestrator/setup.js";
import { Logger } from "./log/logger.js";
import { pruneWorktrees, resolveTargetRepoPath } from "./git/worktree.js";
import type { IssueRangeSpec } from "./types.js";

const DEFAULT_MAX_TICKS = 200;

export function buildCli(): Command {
  const program = new Command();
  program.name("vp-dev").description("LLM-driven development agent runner").version("0.1.0");

  program
    .command("run")
    .description("Run agents against a range of GitHub issues")
    .requiredOption("--agents <n>", "Number of parallel coding agents", parsePositive)
    .requiredOption("--target-repo <owner/repo>", "Target GitHub repo (e.g. octocat/hello-world)")
    .option("--issues <range>", "Issue range: 100-150, csv 100,103,108, or all-open")
    .option("--target-repo-path <path>", "Local clone path of the target repo (default: $HOME/dev/<repo-name>)")
    .option("--resume", "Resume the most recent unfinished run")
    .option("--dry-run", "Intercept comment / PR / push tools with synthetic responses")
    .option("--max-ticks <n>", "Safety cap on scheduling ticks", parsePositive, DEFAULT_MAX_TICKS)
    .option("--verbose", "Mirror a colorized subset of events to stderr")
    .option("--yes", "Auto-approve the setup preview (required for non-TTY environments)")
    .action(async (opts) => {
      await cmdRun(opts);
    });

  program
    .command("status")
    .description("Print summary of the current run + per-agent state")
    .action(async () => {
      await cmdStatus();
    });

  program
    .command("agents")
    .description("Agent management")
    .addCommand(
      new Command("list")
        .description("List the agent roster + specializations")
        .action(async () => {
          await cmdAgentsList();
        }),
    );

  return program;
}

interface RunOpts {
  agents: number;
  targetRepo: string;
  targetRepoPath?: string;
  issues?: string;
  resume?: boolean;
  dryRun?: boolean;
  maxTicks: number;
  verbose?: boolean;
  yes?: boolean;
}

async function cmdRun(opts: RunOpts): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      "INFO: ANTHROPIC_API_KEY is not set; falling back to Claude Code OAuth credentials at ~/.claude/credentials.json.\n",
    );
  }

  if (opts.resume) {
    await runResume(opts);
    return;
  }

  if (!opts.issues) {
    console.error("ERROR: --issues is required (or pass --resume).");
    process.exit(2);
  }

  const existing = await readCurrentRunId();
  if (existing) {
    try {
      const state = await loadRunState(existing);
      if (!isRunComplete(state)) {
        console.error(
          `ERROR: unfinished run ${existing} exists. Pass --resume to continue, or wait for it to complete.`,
        );
        process.exit(2);
      }
    } catch {
      await clearCurrentRunId();
    }
  }

  const range: IssueRangeSpec = parseRangeSpec(opts.issues);
  const repoPath = await resolveTargetRepoPath(opts.targetRepo, opts.targetRepoPath);

  const { open, skippedClosed } = await resolveRangeToIssues(opts.targetRepo, range);
  if (open.length === 0) {
    console.error("ERROR: no open issues in range.");
    process.exit(2);
  }

  const registry = await loadRegistry();
  const preview = buildSetupPreview({
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    rangeLabel: describeRange(range),
    openIssues: open,
    closedSkipped: skippedClosed,
    parallelism: opts.agents,
    dryRun: !!opts.dryRun,
    resume: false,
    registry,
  });
  const approved = await approveSetup({ preview, yes: !!opts.yes });
  if (!approved) {
    process.stderr.write("Aborted by user.\n");
    process.exit(1);
  }

  const runId = makeRunId();
  const state = newRunState({
    runId,
    targetRepo: opts.targetRepo,
    issueRange: range,
    parallelism: opts.agents,
    issueIds: open.map((i) => i.id),
    dryRun: !!opts.dryRun,
  });
  await saveRunState(state);
  await writeCurrentRunId(runId);

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("run.started", {
    runId,
    targetRepo: opts.targetRepo,
    targetRepoPath: repoPath,
    parallelism: opts.agents,
    range: opts.issues,
    issueCount: open.length,
    dryRun: !!opts.dryRun,
  });

  try {
    await pruneWorktrees(repoPath);
    await runOrchestrator({
      state,
      issues: open,
      parallelism: opts.agents,
      maxTicks: opts.maxTicks,
      logger,
      dryRun: !!opts.dryRun,
      targetRepoPath: repoPath,
    });
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: open.length,
    });
    if (isRunComplete(state)) await clearCurrentRunId();
  } finally {
    await logger.close();
  }
  process.stdout.write(`Run ${runId} log: logs/${runId}.jsonl\n`);
}

async function runResume(opts: RunOpts): Promise<void> {
  const runId = await readCurrentRunId();
  if (!runId) {
    console.error("ERROR: no current run to resume.");
    process.exit(2);
  }
  const state = await loadRunState(runId);
  downgradeInFlightToPending(state);
  await saveRunState(state);

  const repoPath = await resolveTargetRepoPath(state.targetRepo, opts.targetRepoPath);
  await pruneWorktrees(repoPath);

  const { open, skippedClosed } = await resolveRangeToIssues(state.targetRepo, state.issueRange);
  const tracked = new Set(Object.keys(state.issues).map(Number));
  const issues = open.filter((i) => tracked.has(i.id));

  const registry = await loadRegistry();
  const preview = buildSetupPreview({
    targetRepo: state.targetRepo,
    targetRepoPath: repoPath,
    rangeLabel: describeRange(state.issueRange),
    openIssues: issues,
    closedSkipped: skippedClosed,
    parallelism: state.parallelism,
    dryRun: state.dryRun,
    resume: true,
    registry,
  });
  const approved = await approveSetup({ preview, yes: !!opts.yes });
  if (!approved) {
    process.stderr.write("Aborted by user.\n");
    process.exit(1);
  }

  const logger = new Logger({ runId, verbose: !!opts.verbose });
  await logger.open();
  logger.info("run.resumed", {
    runId,
    parallelism: state.parallelism,
    issueCount: issues.length,
  });
  try {
    await runOrchestrator({
      state,
      issues,
      parallelism: state.parallelism,
      maxTicks: opts.maxTicks,
      logger,
      dryRun: state.dryRun,
      targetRepoPath: repoPath,
    });
    logger.info("run.completed", {
      runId,
      complete: isRunComplete(state),
      issueCount: issues.length,
    });
    if (isRunComplete(state)) await clearCurrentRunId();
  } finally {
    await logger.close();
  }
}

async function cmdStatus(): Promise<void> {
  const runId = await readCurrentRunId();
  if (!runId) {
    process.stdout.write("No active run.\n");
    return;
  }
  const state = await loadRunState(runId);
  const total = Object.keys(state.issues).length;
  const counts = { pending: 0, "in-flight": 0, done: 0, failed: 0 };
  for (const e of Object.values(state.issues)) counts[e.status] += 1;
  process.stdout.write(`Run ${runId} on ${state.targetRepo}\n`);
  process.stdout.write(
    `  total=${total} pending=${counts.pending} in-flight=${counts["in-flight"]} done=${counts.done} failed=${counts.failed}\n`,
  );
  process.stdout.write(`  ticks=${state.tickCount} parallelism=${state.parallelism} dryRun=${state.dryRun}\n`);
  for (const a of state.agents) {
    process.stdout.write(`  agent ${a.agentId}: ${a.status}\n`);
  }
}

async function cmdAgentsList(): Promise<void> {
  const reg = await loadRegistry();
  if (reg.agents.length === 0) {
    process.stdout.write("No agents in registry yet.\n");
    return;
  }
  const headers = ["agentId", "tags", "issuesHandled", "implement", "pushback", "error", "lastActive"];
  const rows = reg.agents.map((a) => [
    a.agentId,
    a.tags.join(","),
    String(a.issuesHandled),
    String(a.implementCount),
    String(a.pushbackCount),
    String(a.errorCount),
    a.lastActiveAt,
  ]);
  printTable(headers, rows);
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  process.stdout.write(fmt(headers) + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const r of rows) process.stdout.write(fmt(r) + "\n");
}

function parsePositive(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Expected positive integer, got "${value}"`);
  }
  return n;
}
